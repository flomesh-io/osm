package scenarios

import (
	"github.com/google/uuid"
	"k8s.io/client-go/kubernetes"

	"github.com/openservicemesh/osm/pkg/certificate"
	"github.com/openservicemesh/osm/pkg/constants"
	"github.com/openservicemesh/osm/pkg/envoy"
	"github.com/openservicemesh/osm/pkg/tests"
)

func getProxy(kubeClient kubernetes.Interface, proxyCertCommonName certificate.CommonName, porxyCertSerialNumber certificate.SerialNumber) (*envoy.Proxy, error) {
	bookbuyerPodLabels := map[string]string{
		constants.AppLabel:                 tests.BookbuyerService.Name,
		constants.SidecarUniqueIDLabelName: tests.ProxyUUID,
	}
	if _, err := tests.MakePod(kubeClient, tests.Namespace, tests.BookbuyerServiceName, tests.BookbuyerServiceAccountName, bookbuyerPodLabels); err != nil {
		return nil, err
	}

	bookstorePodLabels := map[string]string{
		constants.AppLabel:                 "bookstore",
		constants.SidecarUniqueIDLabelName: uuid.New().String(),
	}
	if _, err := tests.MakePod(kubeClient, tests.Namespace, "bookstore", tests.BookstoreServiceAccountName, bookstorePodLabels); err != nil {
		return nil, err
	}

	selectors := map[string]string{
		constants.AppLabel: tests.BookbuyerServiceName,
	}
	if _, err := tests.MakeService(kubeClient, tests.BookbuyerServiceName, selectors); err != nil {
		return nil, err
	}

	for _, svcName := range []string{tests.BookstoreApexServiceName, tests.BookstoreV1ServiceName, tests.BookstoreV2ServiceName} {
		selectors := map[string]string{
			constants.AppLabel: "bookstore",
		}
		if _, err := tests.MakeService(kubeClient, svcName, selectors); err != nil {
			return nil, err
		}
	}

	return envoy.NewProxy(proxyCertCommonName, porxyCertSerialNumber, nil)
}
