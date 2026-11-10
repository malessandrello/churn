# Exporta los datos del dashboard web (dashboard/index.html) a dashboard/data.js
# Usa el mismo pipeline que dashboard_churn.qmd (misma semilla, mismo modelo logistico),
# asi los numeros de la web coinciden con los del dashboard de Quarto.
# Las etiquetas se exportan en ingles (la web esta en ingles).
# Correr desde la raiz del proyecto: Rscript exportar_datos_web.R

suppressPackageStartupMessages({
  library(tidyverse)
  library(readxl)
  library(janitor)
  library(caret)
  library(pROC)
  library(jsonlite)
})

datos <- read_excel("data.xlsx") %>%
  clean_names() %>%
  select(-count, -country, -state) %>%
  mutate(total_charges = na_if(str_trim(total_charges), "") %>% as.numeric())

# --- etiquetas para mostrar en la web ---
niveles_en <- c(
  "No internet service" = "No internet", "No phone service" = "No phone",
  "Bank transfer (automatic)" = "Bank transfer (auto)",
  "Credit card (automatic)" = "Credit card (auto)"
)
tr <- function(x) unname(coalesce(niveles_en[x], x))

variables_en <- c(
  contract = "Contract", payment_method = "Payment method", internet_service = "Internet",
  online_security = "Online security", online_backup = "Online backup",
  device_protection = "Device protection", tech_support = "Tech support",
  senior_citizen = "Senior citizen", partner = "Has partner",
  dependents = "Has dependents", gender = "Gender",
  phone_service = "Phone service", multiple_lines = "Multiple lines",
  streaming_tv = "Streaming TV", streaming_movies = "Streaming movies",
  paperless_billing = "Paperless billing", tenure_months = "Tenure (months)",
  monthly_charges = "Monthly charges"
)

# --- tasa de churn por nivel de cada variable categorica ---
tasas <- function(vars) {
  datos %>%
    select(all_of(vars), churn_value) %>%
    pivot_longer(-churn_value, names_to = "variable", values_to = "nivel") %>%
    group_by(variable, nivel) %>%
    summarise(clientes = n(), tasa = mean(churn_value), .groups = "drop") %>%
    mutate(
      nivel = if_else(variable == "internet_service" & nivel == "No", "No internet service", nivel),
      etiqueta = unname(variables_en[variable]),
      nivel = tr(nivel),
      variable = factor(variable, levels = vars)   # paneles en el orden pedido
    ) %>%
    arrange(variable) %>%
    mutate(variable = as.character(variable))
}

# --- modelo (identico a dashboard_churn.qmd) ---
set.seed(2026)

model_data <- datos %>%
  select(
    customer_id, churn_label,
    gender, senior_citizen, partner, dependents,
    tenure_months, phone_service, multiple_lines, internet_service,
    online_security, online_backup, device_protection, tech_support,
    streaming_tv, streaming_movies, contract, paperless_billing,
    payment_method, monthly_charges
  ) %>%
  mutate(
    churn_label = factor(churn_label, levels = c("No", "Yes")),
    across(where(is.character) & !customer_id, as.factor)
  )

idx_train  <- createDataPartition(model_data$churn_label, p = 0.75, list = FALSE)
train_data <- model_data[idx_train, ] %>% select(-customer_id)
test_data  <- model_data[-idx_train, ] %>% select(-customer_id)

ctrl <- trainControl(method = "cv", number = 5, classProbs = TRUE,
                     summaryFunction = twoClassSummary, savePredictions = "final")

modelo_glm <- train(churn_label ~ ., data = train_data, method = "glm",
                    family = "binomial", trControl = ctrl, metric = "ROC")

prob_test <- predict(modelo_glm, test_data, type = "prob")[, "Yes"]
roc_glm   <- roc(test_data$churn_label, prob_test, levels = c("No", "Yes"), direction = "<")
umbral    <- as.numeric(coords(roc_glm, "best", best.method = "youden", ret = "threshold")$threshold)

pred_umbral <- factor(ifelse(prob_test > umbral, "Yes", "No"), levels = c("No", "Yes"))
cm_umbral   <- confusionMatrix(pred_umbral, test_data$churn_label, positive = "Yes")

model_data$prob_churn <- predict(modelo_glm, model_data %>% select(-customer_id), type = "prob")[, "Yes"]

# nombre legible de un coeficiente: "contractTwo year" -> "Contract: Two year"
nombre_coef <- function(term) {
  map_chr(term, function(t) {
    if (t %in% names(variables_en)) return(variables_en[[t]])
    var <- names(variables_en)[str_starts(t, names(variables_en))]
    var <- var[which.max(nchar(var))]
    paste0(variables_en[[var]], ": ", tr(str_remove(t, fixed(var))))
  })
}

coefs <- summary(modelo_glm$finalModel)$coefficients %>%
  as.data.frame() %>%
  rownames_to_column("termino") %>%
  filter(termino != "(Intercept)", `Pr(>|z|)` < 0.05) %>%
  transmute(variable = nombre_coef(str_remove_all(termino, "`")),
            estimado = Estimate, p = `Pr(>|z|)`) %>%
  arrange(desc(estimado))

# curva ROC: se reducen los puntos (alcanza con ~200 para dibujarla)
df_roc <- tibble(fpr = 1 - roc_glm$specificities, tpr = roc_glm$sensitivities) %>%
  arrange(fpr, tpr)
df_roc <- df_roc[unique(round(seq(1, nrow(df_roc), length.out = 200))), ]

cm_tabla <- cm_umbral$table  # filas = prediccion, columnas = real

salida <- list(
  kpis = list(
    clientes = nrow(datos),
    tasa_churn = mean(datos$churn_value),
    antiguedad_prom = mean(datos$tenure_months),
    cltv_prom = mean(datos$cltv),
    bajas = sum(datos$churn_value)
  ),
  # cada cliente: [antiguedad, cargo mensual, churn 0/1] para scatter y boxplots
  clientes = datos %>% transmute(t = tenure_months, m = monthly_charges, c = churn_value) %>%
    as.matrix() %>% unname(),
  contrato_facturacion = tasas(c("contract", "payment_method", "internet_service")),
  servicios = tasas(c("online_security", "online_backup", "device_protection", "tech_support")),
  demografia = tasas(c("senior_citizen", "partner", "dependents", "gender")),
  motivos = datos %>%
    filter(churn_label == "Yes", !is.na(churn_reason)) %>%
    count(churn_reason, sort = TRUE) %>%
    transmute(motivo = churn_reason, n),
  modelo = list(
    auc = as.numeric(auc(roc_glm)),
    umbral = umbral,
    sensibilidad = unname(cm_umbral$byClass["Sensitivity"]),
    especificidad = unname(cm_umbral$byClass["Specificity"]),
    precision = unname(cm_umbral$byClass["Pos Pred Value"]),
    n_test = nrow(test_data),
    matriz = list(
      vp = cm_tabla["Yes", "Yes"], fn = cm_tabla["No", "Yes"],
      fp = cm_tabla["Yes", "No"], vn = cm_tabla["No", "No"]
    ),
    roc = df_roc,
    coeficientes = coefs
  ),
  riesgo = model_data %>%
    filter(churn_label == "No") %>%
    arrange(desc(prob_churn)) %>%
    transmute(
      id = customer_id,
      contrato = tr(as.character(contract)),
      internet = if_else(internet_service == "No", "No internet", tr(as.character(internet_service))),
      pago = tr(as.character(payment_method)),
      antiguedad = tenure_months,
      cargo = monthly_charges,
      prob = round(prob_churn, 4)
    )
)

dir.create("dashboard", showWarnings = FALSE)
writeLines(
  c("// Generated by exportar_datos_web.R — do not edit by hand",
    paste0("window.CHURN_DATA = ", toJSON(salida, auto_unbox = TRUE, digits = 4, dataframe = "rows"), ";")),
  "dashboard/data.js", useBytes = TRUE
)
cat("Listo: dashboard/data.js (", round(file.size("dashboard/data.js") / 1024), "KB )\n")
cat("AUC:", round(salida$modelo$auc, 3), "| umbral:", round(umbral, 3), "\n")
