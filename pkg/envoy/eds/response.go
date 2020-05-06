package eds

import (
	"context"

	xds "github.com/envoyproxy/go-control-plane/envoy/api/v2"
	"github.com/golang/protobuf/ptypes"
	"github.com/golang/protobuf/ptypes/any"

	"github.com/open-service-mesh/osm/pkg/catalog"
	"github.com/open-service-mesh/osm/pkg/endpoint"
	"github.com/open-service-mesh/osm/pkg/envoy"
	"github.com/open-service-mesh/osm/pkg/envoy/cla"

	"github.com/open-service-mesh/osm/pkg/smi"
)

// NewResponse creates a new Endpoint Discovery Response.
func NewResponse(ctx context.Context, catalog catalog.MeshCataloger, meshSpec smi.MeshSpec, proxy *envoy.Proxy, request *xds.DiscoveryRequest) (*xds.DiscoveryResponse, error) {
	proxyServiceName := proxy.GetService()
	allTrafficPolicies, err := catalog.ListTrafficPolicies(proxyServiceName)
	if err != nil {
		log.Error().Err(err).Msgf("Failed to list traffic policies for proxy service %q", proxyServiceName)
		return nil, err
	}

	destinationMap := make(map[endpoint.NamespacedService]struct{})
	for _, trafficPolicy := range allTrafficPolicies {
		isSourceService := trafficPolicy.Source.Services.Contains(proxyServiceName)
		if isSourceService {
			for serviceInterface := range trafficPolicy.Destination.Services.Iter() {
				service := serviceInterface.(endpoint.NamespacedService)
				destinationMap[service] = struct{}{}
			}
		}
	}

	var allServicesEndpoints []endpoint.WeightedServiceEndpoints
	for dest := range destinationMap {
		serviceEndpoints, err := catalog.ListTrafficSplitEndpoints(dest)
		if err != nil {
			log.Error().Err(err).Msgf("Failed listing endpoints")
			return nil, err
		}
		allServicesEndpoints = append(allServicesEndpoints, serviceEndpoints...)
	}

	log.Debug().Msgf("allServicesEndpoints: %+v", allServicesEndpoints)
	var protos []*any.Any
	for _, serviceEndpoints := range allServicesEndpoints {
		loadAssignment := cla.NewClusterLoadAssignment(serviceEndpoints)

		proto, err := ptypes.MarshalAny(&loadAssignment)
		if err != nil {
			log.Error().Err(err).Msgf("Error marshalling EDS payload %+v", loadAssignment)
			continue
		}
		protos = append(protos, proto)
	}

	resp := &xds.DiscoveryResponse{
		Resources: protos,
		TypeUrl:   string(envoy.TypeEDS),
	}
	return resp, nil
}
