# Kubernetes Deployment

Deploy oh-my-mcp on Kubernetes with proper resource management, ConfigMap for configuration, and optional TLS termination via Ingress.

---

## Prerequisites

- Kubernetes cluster (v1.20+)
- `kubectl` configured
- Optional: Ingress controller (Nginx, Traefik, etc.)

---

## ConfigMap and Secret

Store configuration in a `ConfigMap`. Example `config.yaml`:

```yaml
managementPort: 8080
gatewayPort: 8090
logLevel: info
compression: true
servers:
  example:
    command: ["npx", "-y", "@modelcontextprotocol/server-example"]
    transport: supergateway
    timeout: 60000
    enabled: true
```

Create the ConfigMap:

```bash
kubectl create configmap oh-my-mcp-config --from-file=config.yaml
```

If you need secrets (API keys, tokens), use a `Secret` and reference them via environment variables:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: oh-my-mcp-secrets
type: Opaque
stringData:
  MY_SERVER_API_KEY: "super-secret"
```

---

## Deployment Manifest

`deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oh-my-mcp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: oh-my-mcp
  template:
    metadata:
      labels:
        app: oh-my-mcp
    spec:
      containers:
        - name: oh-my-mcp
          image: oh-my-mcp:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
              name: management
            - containerPort: 8090
              name: gateway
          env:
            - name: NODE_ENV
              value: production
            - name: MY_SERVER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: oh-my-mcp-secrets
                  key: MY_SERVER_API_KEY
          volumeMounts:
            - name: config
              mountPath: /app/config.yaml
              subPath: config.yaml
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: config
          configMap:
            name: oh-my-mcp-config
```

Apply with `kubectl apply -f deployment.yaml`.

---

## Service

Expose the Gateway via a Service; optionally expose Management separately or use Ingress.

`service.yaml` (ClusterIP for internal use):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: oh-my-mcp
spec:
  selector:
    app: oh-my-mcp
  ports:
    - name: gateway
      port: 8090
      targetPort: 8090
    - name: management
      port: 8080
      targetPort: 8080
```

For external access, use a `LoadBalancer` or `NodePort` service, or an Ingress.

---

## Ingress Example (TLS Termination)

`ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: oh-my-mcp
  annotations:
    # Nginx specific: enable client cert auth if needed
    # nginx.ingress.kubernetes.io/auth-type: basic
spec:
  tls:
    - hosts:
        - mcp.example.com
      secretName: mcp-tls-secret
  rules:
    - host: mcp.example.com
      http:
        paths:
          - path: /mcp
            pathType: Prefix
            backend:
              service:
                name: oh-my-mcp
                port:
                  number: 8090
          - path: /health
            pathType: Exact
            backend:
              service:
                name: oh-my-mcp
                port:
                  number: 8080
```

---

## Autoscaling

Optional Horizontal Pod Autoscaler based on CPU or custom metrics (requests per second):

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: oh-my-mcp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: oh-my-mcp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## Monitoring

- Prometheus can scrape `http://<pod-ip>:8080/metrics`. Use `ServiceMonitor` if using Prometheus Operator.
- Logs: run a DaemonSet for FluentBit/Fluentd to collect container stdout.

---

## Updating

Update the ConfigMap or image, then rollout restart:

```bash
kubectl set image deployment/oh-my-mcp oh-my-mcp=oh-my-mcp:newtag
kubectl rollout restart deployment/oh-my-mcp
```

---

## Security

- Run as non-root (the base Node image uses user `node`).
- Use read-only root filesystem where possible (add `readOnlyRootFilesystem: true`).
- Enable network policies to restrict egress if needed.
- Use secrets for tokens and keys; never commit them to ConfigMap.
