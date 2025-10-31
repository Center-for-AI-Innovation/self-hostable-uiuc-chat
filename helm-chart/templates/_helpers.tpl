{{/*
Expand the name of the chart.
*/}}
{{- define "uiuc-chat.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "uiuc-chat.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "uiuc-chat.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "uiuc-chat.labels" -}}
helm.sh/chart: {{ include "uiuc-chat.chart" . }}
{{ include "uiuc-chat.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "uiuc-chat.selectorLabels" -}}
app.kubernetes.io/name: {{ include "uiuc-chat.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "uiuc-chat.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "uiuc-chat.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Frontend selector labels
*/}}
{{- define "uiuc-chat.frontend.selectorLabels" -}}
{{ include "uiuc-chat.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Backend selector labels
*/}}
{{- define "uiuc-chat.backend.selectorLabels" -}}
{{ include "uiuc-chat.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Worker selector labels
*/}}
{{- define "uiuc-chat.worker.selectorLabels" -}}
{{ include "uiuc-chat.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Ingest Worker selector labels
*/}}
{{- define "uiuc-chat.ingestWorker.selectorLabels" -}}
{{ include "uiuc-chat.selectorLabels" . }}
app.kubernetes.io/component: ingest-worker
{{- end }}

{{/*
Crawlee selector labels
*/}}
{{- define "uiuc-chat.crawlee.selectorLabels" -}}
{{ include "uiuc-chat.selectorLabels" . }}
app.kubernetes.io/component: crawlee
{{- end }}





{{/*
Ollama selector labels
*/}}
{{- define "uiuc-chat.ollama.selectorLabels" -}}
{{ include "uiuc-chat.selectorLabels" . }}
app.kubernetes.io/component: ollama
{{- end }}

{{/*
Generate image name with registry
*/}}
{{- define "uiuc-chat.image" -}}
{{- $registry := "" -}}
{{- if hasKey . "Values" -}}
{{- $registry = .Values.global.imageRegistry | default "" -}}
{{- end -}}
{{- $repository := .repository -}}
{{- $tag := .tag | default "latest" -}}
{{- if $registry -}}
{{ $registry }}/{{ $repository }}:{{ $tag }}
{{- else -}}
{{ $repository }}:{{ $tag }}
{{- end -}}
{{- end }}

{{/*
Environment-specific suffix
*/}}
{{- define "uiuc-chat.env.suffix" -}}
{{- if eq .Values.environment "dev" -}}
-dev
{{- else -}}
{{- end -}}
{{- end }}

{{/*
PostgreSQL connection details (using dependency chart naming)
*/}}
{{- define "uiuc-chat.postgresql.host" -}}
{{- if .Values.postgresql.enabled -}}
{{ include "uiuc-chat.fullname" . }}-postgresql
{{- else -}}
{{- .Values.externalDatabase.host -}}
{{- end -}}
{{- end }}

{{- define "uiuc-chat.postgresql.port" -}}
5432
{{- end }}

{{- define "uiuc-chat.postgresql.database" -}}
{{ .Values.postgresql.auth.database }}
{{- end }}

{{- define "uiuc-chat.postgresql.username" -}}
{{ .Values.postgresql.auth.username }}
{{- end }}

{{/*
Redis connection details (using dependency chart naming)
*/}}
{{- define "uiuc-chat.redis.host" -}}
{{ include "uiuc-chat.fullname" . }}-redis-master
{{- end }}

{{- define "uiuc-chat.redis.port" -}}
6379
{{- end }}

{{/*
RabbitMQ connection details (using dependency chart naming)
*/}}
{{- define "uiuc-chat.rabbitmq.host" -}}
{{ include "uiuc-chat.fullname" . }}-rabbitmq
{{- end }}

{{- define "uiuc-chat.rabbitmq.port" -}}
5672
{{- end }}

{{/*
MinIO connection details (using dependency chart naming)
*/}}
{{- define "uiuc-chat.minio.host" -}}
{{ include "uiuc-chat.fullname" . }}-minio
{{- end }}

{{- define "uiuc-chat.minio.port" -}}
9000
{{- end }}

{{/*
Keycloak connection details (using dependency chart naming)
*/}}
{{- define "uiuc-chat.keycloak.host" -}}
{{ include "uiuc-chat.fullname" . }}-keycloak-http
{{- end }}

{{- define "uiuc-chat.keycloak.port" -}}
8080
{{- end }}

{{/*
Backend connection details
*/}}
{{- define "uiuc-chat.backend.host" -}}
{{ include "uiuc-chat.fullname" . }}-backend
{{- end }}

{{- define "uiuc-chat.backend.port" -}}
8001
{{- end }}


