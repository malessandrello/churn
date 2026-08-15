library(tidyverse)
library(readxl)
library(janitor)
library(caret)
library(ranger)
library(pROC)

set.seed(2026)

# --- 0. Carga y limpieza (igual que EDA.R) ---
data <- read_excel("data.xlsx") %>% clean_names()

data <- data %>%
  select(-count, -country, -state) %>%          # columnas constantes, no aportan
  mutate(total_charges = na_if(str_trim(total_charges), "") %>% as.numeric())

# --- 1. Seleccion de variables ---
# Se excluyen del set de predictores:
#   - customer_id, city, zip_code, lat_long, latitude, longitude: identificadores /
#     geografia de grano fino que no generaliza (alta cardinalidad, riesgo de overfitting).
#   - churn_value: es la misma variable objetivo codificada como 0/1 (duplicado de churn_label).
#   - churn_score: puntaje de propension precalculado por la empresa -> fuga de informacion
#     (ver EDA: separa casi perfecto entre churners y no-churners).
#   - churn_reason: solo existe para clientes que ya se dieron de baja -> fuga de informacion
#     (usa el resultado para explicar el resultado).
#   - cltv: score propietario derivado, se excluye por el mismo motivo que churn_score.
#   - total_charges: colinealidad casi perfecta con tenure_months * monthly_charges
#     (corr ~0.9996 en el EDA) y tiene NAs en clientes nuevos; se conserva tenure_months
#     y monthly_charges por separado, que son las variables "crudas".

model_data <- data %>%
  select(
    churn_label,
    gender, senior_citizen, partner, dependents,
    tenure_months, phone_service, multiple_lines, internet_service,
    online_security, online_backup, device_protection, tech_support,
    streaming_tv, streaming_movies, contract, paperless_billing,
    payment_method, monthly_charges
  ) %>%
  mutate(
    churn_label = factor(churn_label, levels = c("No", "Yes")),
    across(where(is.character), as.factor)
  )

cat("Dimensiones del set de modelado:", dim(model_data), "\n")
cat("Balance de clases:\n")
print(prop.table(table(model_data$churn_label)))

# --- 2. Particion train / test (75/25, estratificada) ---
idx_train <- createDataPartition(model_data$churn_label, p = 0.75, list = FALSE)
train_data <- model_data[idx_train, ]
test_data  <- model_data[-idx_train, ]

cat("\nFilas train:", nrow(train_data), " | Filas test:", nrow(test_data), "\n")

# --- 3. Configuracion de validacion cruzada ---
ctrl <- trainControl(
  method = "cv",
  number = 5,
  classProbs = TRUE,
  summaryFunction = twoClassSummary,
  savePredictions = "final"
)

# --- 4. Modelo 1: Regresion logistica (interpretable, referencia) ---
modelo_glm <- train(
  churn_label ~ .,
  data = train_data,
  method = "glm",
  family = "binomial",
  trControl = ctrl,
  metric = "ROC"
)

# --- 5. Modelo 2: Random Forest (ranger) ---
grilla_rf <- expand.grid(
  mtry = c(3, 5, 8, 12),
  splitrule = "gini",
  min.node.size = c(1, 5, 10)
)

modelo_rf <- train(
  churn_label ~ .,
  data = train_data,
  method = "ranger",
  trControl = ctrl,
  metric = "ROC",
  tuneGrid = grilla_rf,
  importance = "impurity",
  num.threads = 1  # ranger es multi-hilo por defecto; con set.seed() solo, eso rompe
                    # la reproducibilidad corrida a corrida (el orden de generacion de
                    # numeros aleatorios entre hilos no es determinista)
)

# --- 6. Comparacion en validacion cruzada ---
comparacion_cv <- resamples(list(Logistica = modelo_glm, RandomForest = modelo_rf))
cat("\n=== Comparacion en CV (train) ===\n")
print(summary(comparacion_cv))

cat("\nMejor mtry / min.node.size (Random Forest):\n")
print(modelo_rf$bestTune)

# --- 7. Evaluacion en el set de test (holdout) ---
evaluar_modelo <- function(modelo, nombre) {
  prob_yes <- predict(modelo, test_data, type = "prob")[, "Yes"]
  pred_clase <- predict(modelo, test_data)

  cm <- confusionMatrix(pred_clase, test_data$churn_label, positive = "Yes")
  roc_obj <- roc(test_data$churn_label, prob_yes, levels = c("No", "Yes"), direction = "<")

  cat("\n=== ", nombre, " (test) ===\n", sep = "")
  print(cm)
  cat("AUC:", round(as.numeric(auc(roc_obj)), 4), "\n")

  list(cm = cm, roc = roc_obj, prob = prob_yes)
}

res_glm <- evaluar_modelo(modelo_glm, "Regresion logistica")
res_rf  <- evaluar_modelo(modelo_rf,  "Random Forest")

# --- 8. Curvas ROC comparadas ---
png("roc_comparacion.png", width = 900, height = 700, res = 130)
plot(res_glm$roc, col = "#2a78d6", lwd = 2, main = "Curva ROC — set de test")
plot(res_rf$roc, col = "#d03b3b", lwd = 2, add = TRUE)
legend("bottomright",
       legend = c(paste0("Logistica (AUC=", round(as.numeric(auc(res_glm$roc)), 3), ")"),
                  paste0("Random Forest (AUC=", round(as.numeric(auc(res_rf$roc)), 3), ")")),
       col = c("#2a78d6", "#d03b3b"), lwd = 2)
dev.off()

# --- 9. Importancia de variables (Random Forest) ---
imp_rf <- varImp(modelo_rf)$importance %>%
  rownames_to_column("variable") %>%
  arrange(desc(Overall))

cat("\n=== Importancia de variables (Random Forest, top 15) ===\n")
print(head(imp_rf, 15))

g_imp <- imp_rf %>%
  slice_max(Overall, n = 15) %>%
  mutate(variable = fct_reorder(variable, Overall)) %>%
  ggplot(aes(Overall, variable)) +
  geom_col(fill = "#2a78d6") +
  labs(x = "Importancia relativa", y = NULL,
       title = "Variables mas relevantes para predecir churn (Random Forest)") +
  theme_minimal(base_size = 12)

ggsave("importancia_variables.png", g_imp, width = 8, height = 6, dpi = 130)

# --- 10. Coeficientes del modelo logistico (interpretacion de direccion/efecto) ---
cat("\n=== Coeficientes regresion logistica (log-odds) ===\n")
print(summary(modelo_glm$finalModel)$coefficients %>%
        as.data.frame() %>%
        rownames_to_column("variable") %>%
        arrange(`Pr(>|z|)`))

# --- 11. Guardar el mejor modelo para reutilizar (p.ej. en el dashboard) ---
mejor_modelo <- if (max(res_rf$roc$auc, res_glm$roc$auc) == as.numeric(auc(res_rf$roc))) modelo_rf else modelo_glm
saveRDS(mejor_modelo, "modelo_churn.rds")
cat("\nModelo guardado en modelo_churn.rds\n")

# --- 12. Umbral optimo (Youden) para el mejor modelo ---
nombre_mejor <- if (identical(mejor_modelo, modelo_rf)) "Random Forest" else "Regresion logistica"
roc_mejor <- if (identical(mejor_modelo, modelo_rf)) res_rf$roc else res_glm$roc
umbral_optimo <- coords(roc_mejor, "best", best.method = "youden", ret = "threshold")
cat("\nUmbral optimo (Youden) del mejor modelo (", nombre_mejor, ") sobre el set de test: ",
    round(umbral_optimo$threshold, 3), " (por defecto se usa 0.5)\n", sep = "")

# --- 13. Reclasificar la regresion logistica con el umbral optimo y comparar vs 0.5 ---
# predict(modelo, test_data) usa 0.5 por defecto (seccion "evaluar_modelo"); aca se
# reclasifica a mano con el umbral de Youden para ver el trade-off sensibilidad/especificidad.
umbral_glm <- as.numeric(coords(res_glm$roc, "best", best.method = "youden", ret = "threshold")$threshold)

pred_glm_umbral <- factor(
  ifelse(res_glm$prob > umbral_glm, "Yes", "No"),
  levels = c("No", "Yes")
)

cm_glm_umbral <- confusionMatrix(pred_glm_umbral, test_data$churn_label, positive = "Yes")

cat("\n=== Regresion logistica @ umbral ", round(umbral_glm, 3), " (test) ===\n", sep = "")
print(cm_glm_umbral)

comparacion_umbrales <- tibble(
  umbral        = c(0.5, round(umbral_glm, 3)),
  accuracy      = c(res_glm$cm$overall["Accuracy"], cm_glm_umbral$overall["Accuracy"]),
  sensibilidad  = c(res_glm$cm$byClass["Sensitivity"], cm_glm_umbral$byClass["Sensitivity"]),
  especificidad = c(res_glm$cm$byClass["Specificity"], cm_glm_umbral$byClass["Specificity"]),
  precision     = c(res_glm$cm$byClass["Pos Pred Value"], cm_glm_umbral$byClass["Pos Pred Value"])
)

cat("\n=== Comparacion de umbrales — regresion logistica, set de test ===\n")
print(comparacion_umbrales)
