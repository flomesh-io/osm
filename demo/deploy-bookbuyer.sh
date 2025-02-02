#!/bin/bash

set -aueo pipefail

# shellcheck disable=SC1091
source .env
BOOKSTORE_SVC="${BOOKSTORE_SVC:-bookstore}"
CI_MAX_ITERATIONS_THRESHOLD="${CI_MAX_ITERATIONS_THRESHOLD:-0}"
CI_CLIENT_CONCURRENT_CONNECTIONS="${CI_CLIENT_CONCURRENT_CONNECTIONS:-1}"
ENABLE_EGRESS="${ENABLE_EGRESS:-false}"
CI_SLEEP_BETWEEN_REQUESTS_SECONDS="${CI_SLEEP_BETWEEN_REQUESTS_SECONDS:-1}"
DEPLOY_ON_OPENSHIFT="${DEPLOY_ON_OPENSHIFT:-false}"
USE_PRIVATE_REGISTRY="${USE_PRIVATE_REGISTRY:-true}"
KUBERNETES_NODE_ARCH="${KUBERNETES_NODE_ARCH:-amd64}"
KUBERNETES_NODE_OS="${KUBERNETES_NODE_OS:-linux}"

kubectl delete deployment bookbuyer -n "$BOOKBUYER_NAMESPACE"  --ignore-not-found

echo -e "Deploy BookBuyer Service Account"
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: bookbuyer
  namespace: $BOOKBUYER_NAMESPACE
EOF

if [ "$DEPLOY_ON_OPENSHIFT" = true ] ; then
    oc adm policy add-scc-to-user privileged -z bookbuyer -n "$BOOKBUYER_NAMESPACE"
    if [ "$USE_PRIVATE_REGISTRY" = true ]; then
        oc secrets link bookbuyer "$CTR_REGISTRY_CREDS_NAME" --for=pull -n "$BOOKBUYER_NAMESPACE"
    fi
fi

echo -e "Deploy BookBuyer Deployment"
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bookbuyer
  namespace: "$BOOKBUYER_NAMESPACE"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: bookbuyer
      version: v1
  template:
    metadata:
      labels:
        app: bookbuyer
        version: v1
    spec:
      serviceAccountName: bookbuyer
      nodeSelector:
        kubernetes.io/arch: ${KUBERNETES_NODE_ARCH}
        kubernetes.io/os: ${KUBERNETES_NODE_OS}
      containers:
        # Main container with APP
        - name: bookbuyer
          image: "${CTR_REGISTRY}/osm-demo-bookbuyer:${CTR_TAG}"
          imagePullPolicy: Always
          command: ["/bookbuyer"]

          env:
            - name: "BOOKSTORE_NAMESPACE"
              value: "$BOOKSTORE_NAMESPACE"
            - name: "BOOKSTORE_SVC"
              value: "$BOOKSTORE_SVC"
            - name: "CI_MAX_ITERATIONS_THRESHOLD"
              value: "$CI_MAX_ITERATIONS_THRESHOLD"
            - name: "ENABLE_EGRESS"
              value: "$ENABLE_EGRESS"
            - name: "CI_CLIENT_CONCURRENT_CONNECTIONS"
              value: "$CI_CLIENT_CONCURRENT_CONNECTIONS"
            - name: "CI_SLEEP_BETWEEN_REQUESTS_SECONDS"
              value: "$CI_SLEEP_BETWEEN_REQUESTS_SECONDS"

      imagePullSecrets:
        - name: "$CTR_REGISTRY_CREDS_NAME"
EOF

kubectl get pods      --no-headers -o wide --selector app=bookbuyer -n "$BOOKBUYER_NAMESPACE"
kubectl get endpoints --no-headers -o wide --selector app=bookbuyer -n "$BOOKBUYER_NAMESPACE"
kubectl get service                -o wide                          -n "$BOOKBUYER_NAMESPACE"

for x in $(kubectl get service -n "$BOOKBUYER_NAMESPACE" --selector app=bookbuyer --no-headers | awk '{print $1}'); do
    kubectl get service "$x" -n "$BOOKBUYER_NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[*].ip}'
done
