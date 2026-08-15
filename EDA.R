library(tidyverse)
library(readxl)
library(skimr)      # resumen enriquecido tipo glimpse
library(janitor)     # limpieza de nombres + tabyl
library(broom)        # tidy() para tests estadisticos

# --- 0. Carga ---
data <- read_excel("data.xlsx") %>% clean_names()

# --- 1. Estructura general ---
glimpse(data)
skim(data)

# --- 2. Limpieza minima ---
data <- data %>%
  select(-count, -country, -state) %>%          # columnas constantes, no aportan
  mutate(total_charges = na_if(str_trim(total_charges), "") %>% as.numeric())

# filas con total_charges faltante (clientes nuevos, tenure = 0)
data %>% filter(is.na(total_charges))

# --- 3. Missingness completo ---
data %>%
  summarise(across(everything(), ~ sum(is.na(.)))) %>%
  pivot_longer(everything(), names_to = "var", values_to = "n_na") %>%
  filter(n_na > 0) %>%
  arrange(desc(n_na))

# --- 4. Balance de la variable target ---
data %>% tabyl(churn_label) %>% adorn_pct_formatting()

# --- 5. Univariado de numericas clave ---
num_vars <- c("tenure_months", "monthly_charges", "total_charges", "cltv", "churn_score")

data %>%
  select(all_of(num_vars)) %>%
  pivot_longer(everything()) %>%
  ggplot(aes(value)) +
  geom_histogram(bins = 30) +
  facet_wrap(~name, scales = "free")

# --- 6. Categoricas vs churn (tasa de churn por nivel) ---
cat_vars <- c("gender", "senior_citizen", "partner", "dependents", "phone_service",
              "multiple_lines", "internet_service", "online_security", "online_backup",
              "device_protection", "tech_support", "streaming_tv", "streaming_movies",
              "contract", "paperless_billing", "payment_method")

data %>%
  select(all_of(cat_vars), churn_value) %>%
  pivot_longer(-churn_value) %>%
  group_by(name, value) %>%
  summarise(churn_rate = mean(churn_value), n = n(), .groups = "drop") %>%
  ggplot(aes(fct_reorder(value, churn_rate), churn_rate)) +
  geom_col() +
  coord_flip() +
  facet_wrap(~name, scales = "free_y")

# --- 7. Numericas vs churn ---
data %>%
  select(all_of(num_vars), churn_label) %>%
  pivot_longer(-churn_label) %>%
  ggplot(aes(churn_label, value)) +
  geom_boxplot(outlier.alpha = 0.3) +
  facet_wrap(~name, scales = "free_y")

# --- 8. Correlacion entre numericas ---
# ojo: total_charges ~= tenure_months * monthly_charges (colinealidad esperada)
data %>%
  select(all_of(num_vars)) %>%
  cor(use = "pairwise.complete.obs") %>%
  round(2)

# --- 9. Chi-cuadrado categoricas vs churn (significancia) ---
map_dfr(cat_vars, function(v) {
  tbl <- table(data[[v]], data$churn_label)
  tidy(chisq.test(tbl)) %>% mutate(variable = v)
}) %>%
  arrange(p.value)

# --- 10. Motivo de churn (solo entre los que se fueron) ---
data %>%
  filter(churn_label == "Yes") %>%
  count(churn_reason, sort = TRUE) %>%
  ggplot(aes(fct_reorder(churn_reason, n), n)) +
  geom_col() +
  coord_flip()

# --- 11. Geografico (California) ---
data %>%
  ggplot(aes(longitude, latitude, color = churn_label)) +
  geom_point(alpha = 0.4, size = 0.8)


