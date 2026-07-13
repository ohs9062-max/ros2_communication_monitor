import '@xyflow/react/dist/style.css'
import { ReactFlowProvider } from '@xyflow/react'
import { useCallback, useRef } from 'react'
import { SummaryCard } from '../components/SummaryCard.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { CommunicationGraph } from '../components/visualization/CommunicationGraph.jsx'
import { VisualizationDetailPanel } from '../components/visualization/VisualizationDetailPanel.jsx'
import { useVisualizationGraph } from '../hooks/useVisualizationGraph.js'
import { nodeConnectionCount } from '../utils/graphTransform.js'

export function VisualizationPage({ websocket }) {
  const dashboard = useVisualizationGraph()
  const fitViewRef = useRef(null)
  const {
    activeOnly,
    error,
    graph,
    includeHidden,
    loading,
    actions,
    nodes,
    nodeFilterMode,
    refresh,
    search,
    selectableNodes,
    selectedGraphNode,
    selectedGraphNodeId,
    selectedGraphNodeMissing,
    selectedNodeName,
    setActiveOnly,
    setIncludeHidden,
    setNodeFilterMode,
    setSearch,
    setSelectedGraphNodeId,
    setSelectedNodeName,
    setShowActions,
    setShowServices,
    setShowTopics,
    setViewMode,
    showActions,
    showServices,
    showTopics,
    services,
    topics,
    viewMode,
  } = dashboard

  const showEverything = () => {
    setActiveOnly(false)
    setIncludeHidden(true)
    setShowActions(true)
    setShowServices(true)
    setShowTopics(true)
    setViewMode('all')
    setNodeFilterMode('all')
    setSearch('')
    window.setTimeout(() => fitViewRef.current?.(), 80)
  }
  const showGlobalView = () => {
    setNodeFilterMode('all')
    setSelectedNodeName('')
    setSelectedGraphNodeId('')
    setViewMode('nodes')
  }
  const showNodeView = () => {
    setNodeFilterMode('primary')
    setViewMode('nodes')
    setSelectedNodeName('')
    setSelectedGraphNodeId('')
  }
  const selectNode = (nodeName) => {
    setSelectedNodeName(nodeName)
    setSelectedGraphNodeId(`node:${nodeName}`)
    setViewMode('connected')
    window.setTimeout(() => fitViewRef.current?.(), 80)
  }
  const showConnectedView = () => {
    setNodeFilterMode('active')
    setSelectedNodeName('')
    setSelectedGraphNodeId('')
    setViewMode('nodes')
    setActiveOnly(true)
  }
  const setFitViewHandler = useCallback((fitView) => {
    fitViewRef.current = fitView
  }, [])
  const emptyMessage = viewMode === 'connected' && !selectedNodeName
    ? 'Node를 선택하면 해당 Node와 직접 연결된 Topic, Service, Action 관계를 표시합니다.'
    : viewMode === 'connected'
      ? '선택한 Node와 직접 연결된 항목이 없습니다.'
      : '현재 조건에 맞는 연결이 없습니다. 전체 보기를 누르거나 검색/필터를 조정하세요.'
  const isNodeMode = viewMode === 'nodes'
  const isConnectedMode = viewMode === 'connected'
  const isAllMode = viewMode === 'all'
  const isPrimaryNodeFilter = nodeFilterMode === 'primary'
  const isActiveNodeFilter = nodeFilterMode === 'active'
  const isAllNodeFilter = nodeFilterMode === 'all'

  return (
    <main
      className={
        isNodeMode
          ? 'topics-page visualization-page node-list-mode'
          : 'topics-page visualization-page'
      }
    >
      <section className="main-panel">
        <section className="topic-section page-intro visualization-hero">
          <div className="section-heading">
            <div>
              <h2>통신 시각화</h2>
              <p className="muted">
                ROS2 Graph의 Node, Topic, Service, Action 연결 관계를
                운영 화면에서 바로 훑어봅니다.
              </p>
            </div>
            <RealtimePill websocket={websocket} />
          </div>
        </section>

        <div className="summary-grid visualization-summary-grid">
          {isNodeMode ? (
            <>
              <SummaryCard label="전체 Node" value={nodes.length} />
              <SummaryCard label="표시 Node" value={selectableNodes.length} />
              <SummaryCard label="전체 Topic" value={topics.length} />
              <SummaryCard label="전체 Service" value={services.length} />
              <SummaryCard label="전체 Action" value={actions.length} />
            </>
          ) : selectedNodeName && isConnectedMode ? (
            <>
              <SummaryCard label="구독 Topic" value={graph.summary.subscribeTopicCount ?? 0} />
              <SummaryCard label="발행 Topic" value={graph.summary.publishTopicCount ?? 0} />
              <SummaryCard label="응답 Service" value={graph.summary.serviceServerCount ?? 0} />
              <SummaryCard label="요청 Service" value={graph.summary.serviceClientCount ?? 0} />
              <SummaryCard label="Action" value={(graph.summary.actionServerCount ?? 0) + (graph.summary.actionClientCount ?? 0)} />
            </>
          ) : (
            <>
              <SummaryCard label="Node" value={graph.summary.nodeCount} />
              <SummaryCard label="Topic" value={graph.summary.topicCount} />
              <SummaryCard label="Service" value={graph.summary.serviceCount} />
              <SummaryCard label="Action" value={graph.summary.actionCount} />
              <SummaryCard
                label="연결"
                tone={graph.summary.edgeCount ? 'good' : 'default'}
                value={graph.summary.edgeCount}
              />
            </>
          )}
        </div>

        {isAllMode && (
          <section className="notice-text warning visualization-mode-warning">
            전체 중심은 ROS2 Graph 전체 관계를 표시하므로 항목이 많으면
            복잡하게 보일 수 있습니다. Node를 선택한 뒤 연결 중심 보기를
            권장합니다.
          </section>
        )}

        <section className="topic-section visualization-toolbar">
          <div className="filter-toolbar">
            <div
              aria-label="시각화 모드"
              className="visualization-mode-tabs"
              role="group"
            >
              <button
                className={isPrimaryNodeFilter ? 'filter active' : 'filter'}
                onClick={showNodeView}
                type="button"
              >
                주요 노드
              </button>
              <button
                className={isActiveNodeFilter ? 'filter active' : 'filter'}
                onClick={showConnectedView}
                type="button"
              >
                실행 노드
              </button>
              <button
                className={isAllNodeFilter ? 'filter active' : 'filter'}
                onClick={showGlobalView}
                type="button"
              >
                전체 노드
              </button>
            </div>
            <input
              aria-label="통신 그래프 검색"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                !isNodeMode
                  ? '연결된 Topic, Service, Action 검색'
                  : 'Node 이름 또는 namespace 검색'
              }
              type="search"
              value={search}
            />
            {!isNodeMode && (
              <div className="service-filter-actions">
                <>
                  <ToggleButton
                    active={activeOnly}
                    label="주요 항목"
                    onClick={() => setActiveOnly(!activeOnly)}
                  />
                  <ToggleButton
                    active={showTopics}
                    label="Topic"
                    onClick={() => setShowTopics(!showTopics)}
                  />
                  <ToggleButton
                    active={showServices}
                    label="Service"
                    onClick={() => setShowServices(!showServices)}
                  />
                  <ToggleButton
                    active={showActions}
                    label="Action"
                    onClick={() => setShowActions(!showActions)}
                  />
                  <ToggleButton
                    active={includeHidden}
                    label="숨김 포함"
                    onClick={() => setIncludeHidden(!includeHidden)}
                  />
                </>
              </div>
            )}
          </div>
          {!isNodeMode && (
            <div className="visualization-actions">
              {loading && <span className="muted">갱신 중</span>}
              {error && <span className="error-text">Graph API 연결 실패</span>}
              <button
                className="filter"
                onClick={() => fitViewRef.current?.()}
                type="button"
              >
                화면 맞춤
              </button>
              <button className="filter" onClick={showEverything} type="button">
                전체 Graph
              </button>
              <button className="filter active" onClick={refresh} type="button">
                새로고침
              </button>
            </div>
          )}
        </section>

        {isNodeMode && loading && (
          <section className="notice-text visualization-mode-warning">
            데이터를 불러오는 중입니다.
          </section>
        )}

        {isNodeMode && error && (
          <section className="notice-text warning visualization-mode-warning">
            ROS2 데이터를 불러오지 못했습니다. 백엔드 실행 상태와 API 주소를
            확인하세요.
          </section>
        )}

        {isNodeMode && (
          <section className="topic-section visualization-node-picker">
            <div className="section-heading">
              <div>
                <h2>Node 선택</h2>
                <p className="muted">
                  Node를 선택하면 해당 Node와 직접 연결된 Topic, Service,
                  Action 관계를 표시합니다.
                </p>
              </div>
            </div>
            <div className="visualization-node-list">
              {selectableNodes.map((node) => {
                const name = node.full_name ?? node.name
                return (
                  <button
                    className="visualization-node-option"
                    key={name}
                    onClick={() => selectNode(name)}
                    type="button"
                  >
                    <span>
                      <strong>{name}</strong>
                      <small>{node.namespace ?? '/'}</small>
                    </span>
                    <StatusBadge value={node.status ?? 'unknown'} />
                    <em>{nodeConnectionCount(node)} 연결</em>
                  </button>
                )
              })}
              {!selectableNodes.length && (
                <div className="empty-state compact">
                  검색 조건에 맞는 Node가 없습니다.
                </div>
              )}
            </div>
          </section>
        )}

        {graph.limited && !isNodeMode && (
          <section className="notice-text warning visualization-mode-warning">
            연결 항목이 많아 일부만 표시합니다. 검색 또는 내부 항목 필터를
            조정하세요.
          </section>
        )}

        {!isNodeMode && (
          <section className="topic-section visualization-canvas-section">
            <ReactFlowProvider>
              <div className="visualization-flow-wrap">
                <CommunicationGraph
                  edges={graph.edges}
                  nodes={graph.nodes}
                  onFitReady={setFitViewHandler}
                  onSelectNode={setSelectedGraphNodeId}
                  selectedNodeId={selectedGraphNodeId}
                />
                {!graph.nodes.length && (
                  <div className="visualization-empty-overlay">
                    <div className="empty-state compact">{emptyMessage}</div>
                    <button
                      className="filter active"
                      onClick={showEverything}
                      type="button"
                    >
                      전체 보기
                    </button>
                  </div>
                )}
              </div>
            </ReactFlowProvider>
          </section>
        )}
      </section>

      {!isNodeMode && (
        <VisualizationDetailPanel
          graphNode={selectedGraphNode}
          missingNodeId={selectedGraphNodeMissing ? selectedGraphNodeId : ''}
        />
      )}
    </main>
  )
}

function ToggleButton({ active, label, onClick }) {
  return (
    <button
      className={active ? 'filter active' : 'filter'}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function RealtimePill({ websocket }) {
  const connected = websocket?.connected
  return (
    <span className={connected ? 'ws-status connected' : 'ws-status fallback'}>
      <span className={connected ? 'dot connected' : 'dot fallback'} />
      {connected ? 'WebSocket 실시간 연결' : 'REST polling 기반 표시'}
    </span>
  )
}
