# E2E TEST REPORT FOR TAG:v1.1.0-arm

| No   | Context                                                      | ARM64 Result | AMD64 Result |
| ---- | ------------------------------------------------------------ | ------------ | ------------ |
| 01   | CertManagerSimpleClientServer                                | Passed       | Passed       |
| 02   | SimpleClientServer  traffic test involving osm-controller restart: HTTP | Passed       | Passed       |
| 03   | DebugServer                                                  | Passed       | Passed       |
| 04   | DeploymentsClientServer                                      | Passed       | Passed       |
| 05   | HTTP egress policy  without route matches                    | Passed       | Passed       |
| 06   | HTTP egress policy  with route match                         | Passed       | Passed       |
| 07   | HTTPS egress policy                                          | Passed       | Passed       |
| 08   | TCP egress policy                                            | Passed       | Passed       |
| 09   | Egress                                                       | Passed       | Passed       |
| 10   | Fluent Bit deployment                                        | Passed       | Passed       |
| 11   | Fluent Bit output                                            | Passed       | Passed       |
| 12   | Garbage Collection                                           | Passed       | Passed       |
| 13   | gRPC insecure traffic  origination over HTTP2 with SMI HTTP routes | Skip         | Skip         |
| 14   | gRPC secure traffic  origination over HTTP2 with SMI TCP routes | Skip         | Skip         |
| 15   | HashivaultSimpleClientServer                                 | Passed       | Passed       |
| 16   | Test health probes can succeed                               | Passed       | Passed       |
| 17   | Helm install using  default values                           | Passed       | Passed       |
| 18   | Ignore Label                                                 | Passed       | Passed       |
| 19   | HTTP ingress with  IngressBackend                            | Passed       | Passed       |
| 20   | When OSM is Installed                                        | Passed       | Passed       |
| 21   | Test IP range  exclusion                                     | Passed       | Passed       |
| 22   | Version v1.22.8                                              | Passed       | Passed       |
| 23   | Version v1.21.11                                             | Passed       | Passed       |
| 24   | Custom WASM metrics  between one client pod and one server   | Skip         | Skip         |
| 25   | Multiple service  ports                                      | Passed       | Passed       |
| 26   | Multiple services  matching same pod                         | Passed       | Passed       |
| 27   | Becomes ready after  being reinstalled                       | Passed       | Passed       |
| 28   | PermissiveToSmiSwitching                                     | Passed       | Passed       |
| 29   | Permissive mode HTTP  test with a Kubernetes Service for the Source | Passed       | Passed       |
| 30   | Permissive mode HTTP  test without a Kubernetes Service for the Source | Passed       | Passed       |
| 31   | Test traffic flowing  from client to server with a Kubernetes Service for the Source: HTTP | Passed       | Passed       |
| 32   | Test traffic flowing  from client to server without a Kubernetes Service for the Source: HTTP | Passed       | Passed       |
| 33   | Test global port  exclusion                                  | Passed       | Passed       |
| 34   | Test pod level port  exclusion                               | Passed       | Passed       |
| 35   | proxy resources                                              | Passed       | Passed       |
| 36   | Enable Reconciler                                            | Passed       | Passed       |
| 37   | SMI TrafficTarget is  set up properly                        | Passed       | Passed       |
| 38   | SMI Traffic Target is  not in the same namespace as the destination | Passed       | Passed       |
| 39   | SimpleClientServer  TCP with SMI policies                    | Passed       | Passed       |
| 40   | SimpleClientServer  TCP in permissive mode                   | Passed       | Passed       |
| 41   | SimpleClientServer  egress TCP                               | Passed       | Passed       |
| 42   | TCP server-first traffic                                     | Passed       | Passed       |
| 43   | HTTP recursive  traffic splitting with SMI                   | Passed       | Passed       |
| 44   | TCP recursive traffic  splitting with SMI                    | Passed       | Passed       |
| 45   | ClientServerTrafficSplitSameSA                               | Passed       | Passed       |
| 46   | HTTP traffic  splitting - root service selector matches backends | Passed       | Passed       |
| 47   | HTTP traffic  splitting with SMI                             | Passed       | Passed       |
| 48   | TCP traffic splitting  with SMI                              | Passed       | Passed       |
| 49   | HTTP traffic  splitting with Permissive mode                 | Passed       | Passed       |
| 50   | Tests upgrading the  control plane                           | Skip         | Skip         |
| 51   | With SMI Traffic  Target validation enabled                  | Passed       | Passed       |
| 52   | With SMI validation  disabled                                | Passed       | Passed       |

Read more about [test.e2e.xlsx](test.e2e.xlsx)