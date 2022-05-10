(config =>

  pipy({
    _version: '2022.05.07b',

    _targetCount: new stats.Counter('lb_target_cnt', ['target']),

    _specEnableEgress: config?.Spec?.Traffic?.EnableEgress,

    // function : load `HttpServiceRouteRules` json
    _dummyVar: config && (config.funcHttpServiceRouteRules = json => (
      Object.fromEntries(Object.entries(json).map(
        ([name, rule]) => [
          name,
          Object.entries(rule).map(
            ([path, condition], _new) => (
              _new = Object.fromEntries(Object.entries(condition).map(
                ([k, v]) => [k, (
                  ((k === 'Methods') && v && Object.fromEntries(v.map(e => [e, true]))) ||
                  ((k === 'AllowedServices') && v && Object.fromEntries(v.map(e => [e, true]))) ||
                  ((k === 'Headers') && v && Object.entries(v).map(([k, v]) => [k, new RegExp(v)])) ||
                  ((k === 'TargetClusters') && v && new algo.RoundRobinLoadBalancer(v)) // Loadbalancer for services
                  || v
                )]
              )),
              _new['path'] = new RegExp(path), // HTTP request path
              _new
            )
          )
        ]
      ))
    )),

    _inTrafficMatches: config?.Inbound?.TrafficMatches && Object.fromEntries(
      Object.entries(config.Inbound.TrafficMatches).map(
        ([port, match]) => [
          port, // local service port
          Object.fromEntries(Object.entries(match).map(
            ([k, v]) => [k, (
              ((k === 'Protocol') && (v === 'http') && (!config._probeTarget || !match.SourceIPRanges) && (config._probeTarget = '127.0.0.1:' + port) && v) ||
              ((k === 'TargetClusters') && v && new algo.RoundRobinLoadBalancer(v)) ||
              ((k === 'SourceIPRanges') && v && v.map(e => new Netmask(e))) ||
              ((k === 'HttpServiceRouteRules') && v && config.funcHttpServiceRouteRules(v)) 
              || v
            )]
          ))
        ]
      )
    ),

    _inClustersConfigs: config?.Inbound?.ClustersConfigs && Object.fromEntries(
      Object.entries(
        config.Inbound.ClustersConfigs).map(
        ([k, v]) => [
          k, (new algo.RoundRobinLoadBalancer(v))
        ]
      )
    ),

    _outTrafficMatches: config?.Outbound?.TrafficMatches && config.Outbound.TrafficMatches.map(
      (o => Object.fromEntries(Object.entries(o).map(
        ([k, v]) => [k, (
          ((k === 'TargetClusters') && v && new algo.RoundRobinLoadBalancer(v)) ||
          ((k === 'DestinationIPRanges') && v && v.map(e => new Netmask(e))) ||
          ((k === 'HttpServiceRouteRules') && v && config.funcHttpServiceRouteRules(v)) ||
          v
        )]
      )))
    ),

    // Loadbalancer for endpoints
    _outClustersConfigs: config?.Outbound?.ClustersConfigs && Object.fromEntries(
      Object.entries(config.Outbound.ClustersConfigs).map(
        ([k, v]) => [
          k, (new algo.RoundRobinLoadBalancer(v))
        ]
      )
    ),

    // Set probe-target port
    _SpecProbes: config?.Spec?.Probes?.LivenessProbes && config.Spec.Probes.LivenessProbes[0]?.httpGet?.port == 15901 &&
      (config._probeScheme = config.Spec.Probes.LivenessProbes[0].httpGet.scheme) && !Boolean(config._probeTarget) &&
      ((config._probeScheme === 'HTTP' && (config._probeTarget = '127.0.0.1:80')) ||
        (config._probeScheme === 'HTTPS' && (config._probeTarget = '127.0.0.1:443'))) && (config._probePath = '/'),

    _AllowedEndpoints: config?.AllowedEndpoints,
    // PIPY admin port
    _prometheusTarget: '127.0.0.1:6060',

    _inMatch: undefined,
    _inTarget: undefined,
    _inProtocol: undefined,
    _inSessionControl: null,
    _inClientIP: undefined,
    _inXForwardedFor: undefined,

    _outIP: undefined,
    _outPort: undefined,
    _outMatch: undefined,
    _outTarget: undefined,
    _outProtocol: undefined,
    _outSessionControl: null
  })

  // inbound
  .listen(config?.Inbound?.TrafficMatches ? 15003 : 0, {
    'transparent': true,
    'closeEOF': false
    // 'readTimeout': '5s'
  })
  .handleStreamStart(
    (_inPort, _target) => (
      // client ip
      _inClientIP = __inbound.remoteAddress,

      // Local service port
      _inPort = (__inbound?.destinationPort ? __inbound.destinationPort : '0'),

      // Check the global whitelist
      _AllowedEndpoints && _AllowedEndpoints[_inClientIP] &&
      _inTrafficMatches && (_inMatch = _inTrafficMatches[_inPort]) &&
      // Check the INBOUND whitelist
      (!Boolean(_inMatch['AllowedEndpoints']) || _inMatch['AllowedEndpoints'][_inClientIP]) &&
      // HTTP protocol do L7 proxy, otherwise do L4 proxy.
      (
        // if
        ((_inMatch['Protocol'] === 'http') && (_inProtocol = 'http')) ||
        // else
        ((_target = _inMatch['TargetClusters'].select()) && // service load balancer
          _inClustersConfigs[_target] && (_inTarget = _inClustersConfigs[_target].select())) // endpoint load balancer
      ),

      _inSessionControl = {
        close: false
      }
    )
  )
  .link(
    'http_in', () => _inProtocol === 'http',
    'connection_in', () => Boolean(_inTarget),
    'deny_in'
  )
  .pipeline('http_in')
  .demuxHTTP('inbound')
  .replaceMessageStart(
    evt => _inSessionControl.close ? new StreamEnd : evt
  )
  .pipeline('inbound')
  .handleMessageStart(
    (msg, _service, _route, _match, _target) => (
      // If downstream is HTTP proxy, set _inXForwardedFor true
      msg.head?.headers['x-forwarded-for'] && (_inXForwardedFor = true),

      // The SourceIPRanges is not null means INGRESS then set _service *,
      // otherwise, match HTTP HOST.
      (
        // if
        (_inMatch.SourceIPRanges && _inMatch.SourceIPRanges.find(e => e.contains(_inClientIP)) && (_service = "*")) ||
        // else
        (msg.head.headers['serviceidentity'] && msg.head.headers?.host && (_service = _inMatch.HttpHostPort2Service[msg.head.headers.host]))
      )
      // Find route rule by _service/hostname
      &&
      (_route = _inMatch.HttpServiceRouteRules[_service]),

      // Apply route rules
      _route &&
      (_match = _route.find(o => (
        o.path.exec(msg.head.path) &&
        (!o.Methods || o.Methods[msg.head.method] || o.Methods['*']) &&
        (!o.AllowedServices || o.AllowedServices[msg.head.headers['serviceidentity']] || o.AllowedServices['*']) &&
        (!o.Headers || o.Headers.every(h => msg.head.headers[h[0]] && h[1].exec(msg.head.headers[h[0]])))))) &&
      // RoundRobinLoadBalance ---> service ---> endpoint
      (_target = _match.TargetClusters.select()) && _inClustersConfigs[_target] && (_inTarget = _inClustersConfigs[_target].select())
    )
  )
  .link(
    'request_in', () => Boolean(_inTarget),
    'deny_in_http'
  )
  .pipeline('request_in')
  .muxHTTP(
    'connection_in', () => _inTarget
  )
  .pipeline('connection_in')
  .connect(
    () => _inTarget
  )
  .pipeline('deny_in_http')
  .replaceMessage(
    msg => (
      _inSessionControl.close = Boolean(_inXForwardedFor), new Message({
        status: 403
      }, 'Access denied')
    )
  )
  .pipeline('deny_in')
  .replaceStreamStart(
    new StreamEnd('ConnectionReset')
  )

  // outbound
  .listen(config?.Outbound || config?.Spec?.Traffic?.EnableEgress ? 15001 : 0, {
    'transparent': true,
    'closeEOF': false
    // 'readTimeout': '5s'
  })
  .handleStreamStart(
    (_target) => (
      // Upstream service port
      _outPort = (__inbound?.destinationPort ? __inbound.destinationPort : '0'),

      // Upstream service IP
      _outIP = (__inbound?.destinationAddress ? __inbound.destinationAddress : '127.0.0.1'),

      _outMatch = (_outTrafficMatches && (
        // Strict matching Destination IP address
        _outTrafficMatches.find(o => ((o.Port == _outPort) && o.DestinationIPRanges && o.DestinationIPRanges.find(e => e.contains(_outIP)))) ||
        // EGRESS mode - does not check the IP
        _outTrafficMatches.find(o => ((o.Port == _outPort) && !Boolean(o.DestinationIPRanges) &&
          (o.Protocol === 'http' || o.Protocol === 'https' || (o.Protocol === 'tcp' && o.AllowedEgressTraffic))))
      )),

      // http protocol
      _outMatch && (_outMatch['Protocol'] === 'http') && (_outProtocol = 'http'),

      // non-http protocol
      !Boolean(_outProtocol) && _outMatch &&
      ((_target = (_outMatch['TargetClusters'] && _outMatch['TargetClusters'].select())) && // service load balancer
        _outClustersConfigs[_target] && (_outTarget = _outClustersConfigs[_target]?.select())), // endpoint load balancer

      // EGRESS mode
      (_outProtocol != 'http') && !Boolean(_outTarget) && (
        (_specEnableEgress || (_outMatch && _outMatch.AllowedEgressTraffic)) &&
        (_outTarget = _outIP + ':' + _outPort)), // original IP address and original port

      _outSessionControl = {
        close: false
      }
    )
  )
  .link(
    'http_out', () => _outProtocol === 'http',
    'connection_out', () => Boolean(_outTarget),
    'deny_out'
  )
  .pipeline('http_out')
  .demuxHTTP('outbound')
  .replaceMessageStart(
    evt => _outSessionControl.close ? new StreamEnd : evt
  )
  .pipeline('outbound')
  .handleMessageStart(
    (msg, _service, _route, _match, _target) => (
      // Find route by HTTP host
      msg.head.headers?.host && (_service = _outMatch.HttpHostPort2Service[msg.head.headers.host]) &&
      (_route = _outMatch.HttpServiceRouteRules[_service]),

      // Apply route rules
      _route &&
      (_match = _route.find(o => (
        o.path.exec(msg.head.path) &&
        (!o.Methods || o.Methods[msg.head.method] || o.Methods['*']) &&
        (!o.AllowedServices || o.AllowedServices[msg.head.headers['serviceidentity']] || o.AllowedServices['*']) &&
        (!o.Headers || o.Headers.every(h => msg.head.headers[h[0]] && h[1].exec(msg.head.headers[h[0]])))
      ))),

      // RoundRobinLoadBalance ---> service ---> endpoint
      _match &&
      (_target = _match.TargetClusters.select()) && (_outTarget = _outClustersConfigs[_target].select()) &&
      // Add serviceidentity for request authentication
      (msg.head.headers['serviceidentity'] = _outMatch.ServiceIdentity),

      // EGRESS mode
      !Boolean(_outTarget) && (_specEnableEgress || (_outMatch && _outMatch.AllowedEgressTraffic)) &&
      (_outTarget = _outIP + ':' + _outPort),

      // Loadbalancer metrics
      _outTarget && _targetCount.withLabels(_outTarget).increase()
    )
  )
  .link(
    'request_out', () => Boolean(_outTarget),
    'deny_out_http'
  )
  .pipeline('request_out')
  .muxHTTP(
    'connection_out', () => _outTarget
  )
  .pipeline('connection_out')
  .connect(
    () => _outTarget
  )
  .pipeline('deny_out_http')
  .replaceMessage(
    msg => (
      _outSessionControl.close = false, new Message({
        status: 403
      }, 'Access denied')
    )
  )
  .pipeline('deny_out')
  .replaceStreamStart(
    new StreamEnd('ConnectionReset')
  )

  // liveness probe
  .listen(config?._probeScheme ? 15901 : 0)
  .link(
    'http_liveness', () => config._probeScheme === 'HTTP',
    'connection_liveness', () => Boolean(config._probeTarget),
    'deny_liveness'
  )
  .pipeline('http_liveness')
  .demuxHTTP('message_liveness')
  .pipeline('message_liveness')
  .handleMessageStart(
    msg => (
      msg.head.path === '/osm-liveness-probe' && (msg.head.path = '/liveness'),
      config._probePath && (msg.head.path = config._probePath)
    )
  )
  .muxHTTP('connection_liveness', config?._probeTarget)
  .pipeline('connection_liveness')
  .connect(() => config?._probeTarget)
  .pipeline('deny_liveness')
  .replaceStreamStart(
    new StreamEnd('ConnectionReset')
  )

  // readiness probe
  .listen(config?._probeScheme ? 15902 : 0)
  .link(
    'http_readiness', () => config._probeScheme === 'HTTP',
    'connection_readiness', () => Boolean(config._probeTarget),
    'deny_readiness'
  )
  .pipeline('http_readiness')
  .demuxHTTP('message_readiness')
  .pipeline('message_readiness')
  .handleMessageStart(
    msg => (
      msg.head.path === '/osm-readiness-probe' && (msg.head.path = '/readiness'),
      config._probePath && (msg.head.path = config._probePath)
    )
  )
  .muxHTTP('connection_readiness', config?._probeTarget)
  .pipeline('connection_readiness')
  .connect(() => config?._probeTarget)
  .pipeline('deny_readiness')
  .replaceStreamStart(
    new StreamEnd('ConnectionReset')
  )

  // startup probe
  .listen(config?._probeScheme ? 15903 : 0)
  .link(
    'http_startup', () => config._probeScheme === 'HTTP',
    'connection_startup', () => Boolean(config._probeTarget),
    'deny_startup'
  )
  .pipeline('http_startup')
  .demuxHTTP('message_startup')
  .pipeline('message_startup')
  .handleMessageStart(
    msg => (
      msg.head.path === '/osm-startup-probe' && (msg.head.path = '/startup'),
      config._probePath && (msg.head.path = config._probePath)
    )
  )
  .muxHTTP('connection_startup', config?._probeTarget)
  .pipeline('connection_startup')
  .connect(() => config?._probeTarget)
  .pipeline('deny_startup')
  .replaceStreamStart(
    new StreamEnd('ConnectionReset')
  )

  // Prometheus collects metrics 
  .listen(15010)
  .link('http_prometheus')
  .pipeline('http_prometheus')
  .demuxHTTP('message_prometheus')
  .pipeline('message_prometheus')
  .handleMessageStart(
    msg => (
      // Forward to PIPY
      (msg.head.path === '/stats/prometheus' && (msg.head.path = '/metrics')) || (msg.head.path = '/stats' + msg.head.path)
    )
  )
  .muxHTTP('connection_prometheus', () => _prometheusTarget)
  .pipeline('connection_prometheus')
  .connect(() => _prometheusTarget)

  .listen(15000)
  .serveHTTP(
    msg =>
    http.File.from('pipy.json').toMessage(msg.head.headers['accept-encoding'])
  )

)(JSON.decode(pipy.load('pipy.json')))
