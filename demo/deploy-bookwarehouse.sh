#!/bin/bash

set -aueo pipefail

# shellcheck disable=SC1091
source .env
DEPLOY_ON_OPENSHIFT="${DEPLOY_ON_OPENSHIFT:-false}"
USE_PRIVATE_REGISTRY="${USE_PRIVATE_REGISTRY:-true}"
KUBERNETES_NODE_ARCH="${KUBERNETES_NODE_ARCH:-amd64}"
KUBERNETES_NODE_OS="${KUBERNETES_NODE_OS:-linux}"

KUBE_CONTEXT=$(kubectl config current-context)

kubectl delete deployment bookwarehouse -n "$BOOKWAREHOUSE_NAMESPACE"  --ignore-not-found

echo -e "Deploy Bookwarehouse Service Account"
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: bookwarehouse
  namespace: $BOOKWAREHOUSE_NAMESPACE
EOF

if [ "$DEPLOY_ON_OPENSHIFT" = true ] ; then
    oc adm policy add-scc-to-user privileged -z bookwarehouse -n "$BOOKWAREHOUSE_NAMESPACE"
    if [ "$USE_PRIVATE_REGISTRY" = true ]; then
        oc secrets link bookwarehouse "$CTR_REGISTRY_CREDS_NAME" --for=pull -n "$BOOKWAREHOUSE_NAMESPACE"
    fi
fi

echo -e "Deploy Bookwarehouse Service"
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: bookwarehouse
  namespace: $BOOKWAREHOUSE_NAMESPACE
  labels:
    app: bookwarehouse
spec:
  ports:
  - port: 14001
    name: bookwarehouse-port

  selector:
    app: bookwarehouse
EOF

echo -e "Deploy Bookwarehouse Deployment"
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bookwarehouse
  namespace: "$BOOKWAREHOUSE_NAMESPACE"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: bookwarehouse
  template:
    metadata:
      labels:
        app: bookwarehouse
        version: v1
    spec:
      serviceAccountName: bookwarehouse
      nodeSelector:
        kubernetes.io/arch: ${KUBERNETES_NODE_ARCH}
        kubernetes.io/os: ${KUBERNETES_NODE_OS}
      containers:
        # Main container with APP
        - name: bookwarehouse
          image: "${CTR_REGISTRY}/osm-demo-bookwarehouse:${CTR_TAG}"
          imagePullPolicy: Always
          command: ["/bookwarehouse"]
          env:
            - name: IDENTITY
              value: bookwarehouse.${KUBE_CONTEXT}

      imagePullSecrets:
        - name: "$CTR_REGISTRY_CREDS_NAME"
EOF

kubectl get pods      --no-headers -o wide --selector app=bookwarehouse -n "$BOOKWAREHOUSE_NAMESPACE"
kubectl get endpoints --no-headers -o wide --selector app=bookwarehouse -n "$BOOKWAREHOUSE_NAMESPACE"
kubectl get service                -o wide                          -n "$BOOKWAREHOUSE_NAMESPACE"

for x in $(kubectl get service -n "$BOOKWAREHOUSE_NAMESPACE" --selector app=bookwarehouse --no-headers | awk '{print $1}'); do
    kubectl get service "$x" -n "$BOOKWAREHOUSE_NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[*].ip}'
done
