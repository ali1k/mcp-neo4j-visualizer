import fs from 'fs';
import { BaseVisualization } from './base.js';
import { Neo4jNode, Neo4jRelationship, LineageConfig, VisualizationOptions } from '../types.js';
import { getNodeIcon, getNodeColor, getEdgeColor } from '../utils/colors.js';

export class ReactFlowVisualization extends BaseVisualization {
  async generate(args: { 
    nodes: Neo4jNode[]; 
    relationships: Neo4jRelationship[]; 
    lineageConfig?: LineageConfig;
    title?: string; 
    width?: number; 
    height?: number; 
    outputPath?: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { 
      nodes, 
      relationships, 
      lineageConfig = {},
      title = 'Neo4j ReactFlow Lineage',
      width = 1200,
      height = 800,
      outputPath
    } = args;

    // Process the lineage configuration
    const config = {
      direction: lineageConfig.direction || 'LR',
      groupByProperty: lineageConfig.groupByProperty,
      showHierarchy: lineageConfig.showHierarchy !== false,
      enableFiltering: lineageConfig.enableFiltering !== false,
      enableExpansion: lineageConfig.enableExpansion !== false,
      nodeSpacing: lineageConfig.nodeSpacing || 100,
      rankSpacing: lineageConfig.rankSpacing || 150,
      ...lineageConfig
    };

    // Process Neo4j data for ReactFlow
    const processedData = this.processReactFlowData(nodes, relationships, config);
    
    // Generate the ReactFlow component
    const componentCode = this.generateReactFlowLineageComponent(processedData, config, {
      title,
      width,
      height
    });

    // Generate standalone HTML optimized for iframe embedding
    const htmlVisualization = this.generateReactFlowHTML(componentCode, processedData, {
      title,
      width,
      height
    });

    if (outputPath) {
      fs.writeFileSync(outputPath, htmlVisualization);
    }

    // Return structured output optimized for iframe embedding
    const metadata = {
      nodeCount: nodes.length,
      relationshipCount: relationships.length,
      config,
      title,
      dimensions: { width, height }
    };

    return {
      content: [
        {
          type: 'text',
          text: `# ReactFlow Visualization Generated

## Metadata
- **Nodes**: ${nodes.length}
- **Relationships**: ${relationships.length}
- **Title**: ${title}
- **Dimensions**: ${width}x${height}
- **Configuration**: ${JSON.stringify(config, null, 2)}

## Compiled HTML for Iframe Embedding

The following HTML is ready to be embedded in an iframe:

\`\`\`html
${htmlVisualization}
\`\`\`

${outputPath ? `\n## File Output\nSaved HTML visualization to: ${outputPath}` : ''}

## Usage
To embed this visualization in an iframe, use the HTML content above directly as the iframe source or save it to a file and reference it.`,
        },
      ],
    };
  }

  private processReactFlowData(nodes: Neo4jNode[], relationships: Neo4jRelationship[], config: any) {
    // Transform nodes for ReactFlow
    const reactFlowNodes = nodes.map(node => {
      const primaryLabel = node.labels[0] || 'Unknown';
      const displayName = node.properties.name || node.properties.title || node.id;
      
      return {
        id: node.id,
        type: 'lineageNode',
        data: {
          label: displayName,
          nodeTypes: node.labels,
          properties: node.properties,
          primaryLabel,
          icon: getNodeIcon(node.labels),
          color: getNodeColor(primaryLabel)
        },
        position: { x: 0, y: 0 }, // Will be set by layout
        draggable: true
      };
    });

    // Transform relationships for ReactFlow
    const reactFlowEdges = relationships.map(rel => ({
      id: rel.id,
      source: rel.startNodeId,
      target: rel.endNodeId,
      type: 'lineageEdge',
      data: {
        label: rel.type,
        properties: rel.properties,
        relationType: rel.type
      },
      animated: rel.properties.animated || false,
      style: {
        stroke: getEdgeColor(rel.type),
        strokeWidth: rel.properties.weight ? Math.max(1, rel.properties.weight) : 2
      }
    }));

    // Process hierarchical grouping if enabled
    let processedNodes = reactFlowNodes;
    let processedEdges = reactFlowEdges;

    if (config.showHierarchy && config.groupByProperty) {
      const hierarchyResult = this.processHierarchicalGrouping(
        reactFlowNodes, 
        reactFlowEdges, 
        config.groupByProperty
      );
      processedNodes = hierarchyResult.nodes;
      processedEdges = hierarchyResult.edges;
    }

    // Apply layout
    const layoutResult = this.applyReactFlowLayout(processedNodes, processedEdges, config);

    return {
      nodes: layoutResult.nodes,
      edges: layoutResult.edges,
      nodeTypes: this.getUniqueNodeTypes(nodes),
      edgeTypes: this.getUniqueEdgeTypes(relationships),
      config
    };
  }

  private processHierarchicalGrouping(nodes: any[], edges: any[], groupProperty: string) {
    // Group nodes by the specified property
    const groups: Record<string, any[]> = {};
    const ungroupedNodes: any[] = [];

    nodes.forEach(node => {
      const groupValue = node.data.properties[groupProperty];
      if (groupValue) {
        if (!groups[groupValue]) {
          groups[groupValue] = [];
        }
        groups[groupValue].push(node);
      } else {
        ungroupedNodes.push(node);
      }
    });

    // Create parent nodes for groups
    const parentNodes: any[] = [];
    const childNodes: any[] = [];

    Object.entries(groups).forEach(([groupValue, groupNodes]) => {
      if (groupNodes.length > 1) {
        // Create parent node
        const parentId = `group-${groupValue}`;
        parentNodes.push({
          id: parentId,
          type: 'groupNode',
          data: {
            label: groupValue,
            nodeTypes: ['Group'],
            properties: { [groupProperty]: groupValue },
            primaryLabel: 'Group',
            icon: 'folder',
            color: '#e9ecef',
            isGroup: true,
            childCount: groupNodes.length
          },
          position: { x: 0, y: 0 },
          style: {
            width: 300,
            height: Math.max(100, groupNodes.length * 60 + 40)
          }
        });

        // Update child nodes
        groupNodes.forEach((node, index) => {
          childNodes.push({
            ...node,
            parentNode: parentId,
            extent: 'parent',
            position: {
              x: 20,
              y: 40 + index * 60
            },
            style: {
              width: 260,
              height: 50
            }
          });
        });
      } else {
        // Single node, keep as is
        ungroupedNodes.push(...groupNodes);
      }
    });

    return {
      nodes: [...parentNodes, ...childNodes, ...ungroupedNodes],
      edges
    };
  }

  private applyReactFlowLayout(nodes: any[], edges: any[], config: any) {
    // Simple layout algorithm - in a real implementation, you'd use Dagre or similar
    const layoutNodes = nodes.map((node, index) => {
      if (node.parentNode) {
        // Child nodes keep their relative positions
        return node;
      }

      // Simple grid layout for top-level nodes
      const cols = Math.ceil(Math.sqrt(nodes.filter(n => !n.parentNode).length));
      const row = Math.floor(index / cols);
      const col = index % cols;

      return {
        ...node,
        position: {
          x: col * (config.nodeSpacing + 200),
          y: row * (config.rankSpacing + 100)
        }
      };
    });

    return {
      nodes: layoutNodes,
      edges
    };
  }


  private generateReactFlowLineageComponent(data: any, config: any, options: any): string {
    return `
import React, { useCallback, useState, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Custom Node Component
const LineageNode = ({ data, selected }: NodeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      style={{
        padding: '10px',
        borderRadius: '8px',
        border: selected ? '2px solid #0073e6' : '1px solid #ddd',
        backgroundColor: data.isGroup ? '#f8f9fa' : 'white',
        boxShadow: selected ? '0 0 10px rgba(0,115,230,0.3)' : '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: data.isGroup ? '280px' : '200px',
        minHeight: data.isGroup ? '80px' : '60px'
      }}
    >
      <Handle type="target" position={Position.Left} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {data.icon && (
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: data.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '12px'
            }}
          >
            {data.icon.charAt(0).toUpperCase()}
          </div>
        )}
        
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontWeight: 'bold',
            fontSize: '14px',
            marginBottom: '4px'
          }}>
            {data.label}
          </div>
          <div style={{ 
            fontSize: '12px',
            color: '#666',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px'
          }}>
            {data.nodeTypes.map((type, index) => (
              <span
                key={index}
                style={{
                  backgroundColor: '#e9ecef',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px'
                }}
              >
                {type}
              </span>
            ))}
          </div>
        </div>
        
        {data.isGroup && (
          <div style={{ 
            fontSize: '12px',
            color: '#666',
            fontWeight: 'bold'
          }}>
            {data.childCount} items
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

// Custom Edge Component
const LineageEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd="url(#arrow)"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: \`translate(-50%, -50%) translate(\${labelX}px,\${labelY}px)\`,
            fontSize: '10px',
            fontWeight: 500,
            background: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            pointerEvents: 'none'
          }}
        >
          {data?.label || ''}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const nodeTypes = {
  lineageNode: LineageNode,
  groupNode: LineageNode
};

const edgeTypes = {
  lineageEdge: LineageEdge
};

const ReactFlowLineage = ({ initialNodes = [], initialEdges = [], config = {} }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const nodeTypeStats = useMemo(() => {
    const stats = {};
    nodes.forEach(node => {
      node.data.nodeTypes.forEach(type => {
        stats[type] = (stats[type] || 0) + 1;
      });
    });
    return stats;
  }, [nodes]);

  const edgeTypeStats = useMemo(() => {
    const stats = {};
    edges.forEach(edge => {
      const type = edge.data?.relationType || 'Unknown';
      stats[type] = (stats[type] || 0) + 1;
    });
    return stats;
  }, [edges]);

  return (
    <div style={{ width: '100%', height: '100%', fontFamily: 'Arial, sans-serif' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <svg>
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <polygon points="0,0 10,5 0,10" fill="#999" />
            </marker>
          </defs>
        </svg>
        
        <Background />
        <Controls />
        <MiniMap />
        
        <Panel position="top-left">
          <div style={{ 
            background: 'white', 
            padding: '10px', 
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            minWidth: '200px'
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Graph Statistics</h3>
            <div style={{ fontSize: '12px', marginBottom: '8px' }}>
              <strong>Nodes:</strong> {nodes.length} | <strong>Edges:</strong> {edges.length}
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              {showFilters ? 'Hide' : 'Show'} Filters
            </button>
            
            {showFilters && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ fontSize: '12px' }}>Node Types:</strong>
                  {Object.entries(nodeTypeStats).map(([type, count]) => (
                    <div key={type} style={{ fontSize: '11px', margin: '2px 0' }}>
                      {type}: {count}
                    </div>
                  ))}
                </div>
                
                <div>
                  <strong style={{ fontSize: '12px' }}>Edge Types:</strong>
                  {Object.entries(edgeTypeStats).map(([type, count]) => (
                    <div key={type} style={{ fontSize: '11px', margin: '2px 0' }}>
                      {type}: {count}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
        
        {selectedNode && (
          <Panel position="top-right">
            <div style={{ 
              background: 'white', 
              padding: '15px', 
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              maxWidth: '300px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Node Details</h3>
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '16px',
                    cursor: 'pointer',
                    padding: '0',
                    color: '#666'
                  }}
                >
                  ×
                </button>
              </div>
              
              <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                <strong>{selectedNode.data.label}</strong>
              </div>
              
              <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                <strong>Types:</strong> {selectedNode.data.nodeTypes.join(', ')}
              </div>
              
              {selectedNode.data.properties && Object.keys(selectedNode.data.properties).length > 0 && (
                <div style={{ fontSize: '12px' }}>
                  <strong>Properties:</strong>
                  <div style={{ 
                    background: '#f8f9fa', 
                    padding: '8px', 
                    borderRadius: '4px',
                    marginTop: '4px',
                    maxHeight: '200px',
                    overflow: 'auto'
                  }}>
                    {Object.entries(selectedNode.data.properties).map(([key, value]) => (
                      <div key={key} style={{ margin: '2px 0' }}>
                        <strong>{key}:</strong> {String(value)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
};

export default ReactFlowLineage;
`;
  }

  private generateReactFlowHTML(componentCode: string, data: any, options: any): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.title}</title>
    <style>
        * {
            box-sizing: border-box;
        }
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background-color: #f8f9fa;
            overflow: hidden;
        }
        #root {
            width: 100%;
            height: 100%;
        }
        .iframe-container {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        .iframe-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 1000;
            flex-shrink: 0;
        }
        .iframe-header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }
        .iframe-header p {
            margin: 4px 0 0 0;
            font-size: 13px;
            opacity: 0.9;
        }
        .iframe-visualization {
            flex: 1;
            position: relative;
            min-height: 0;
        }
        /* Custom ReactFlow styles for iframe */
        .react-flow__panel {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 0, 0, 0.1);
        }
        .react-flow__controls {
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .react-flow__minimap {
            border: 1px solid rgba(0, 0, 0, 0.1);
        }
        /* Responsive adjustments */
        @media (max-width: 768px) {
            .iframe-header {
                padding: 8px 12px;
            }
            .iframe-header h1 {
                font-size: 16px;
            }
            .iframe-header p {
                font-size: 12px;
            }
        }
        /* Loading indicator */
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="loading">Loading visualization...</div>
    </div>
    
    <script>
        // Fallback visualization without external dependencies
        const data = ${JSON.stringify(data, null, 2)};
        
        function createFallbackVisualization() {
            const container = document.getElementById('root');
            
            // Create header
            const header = document.createElement('div');
            header.className = 'iframe-header';
            header.innerHTML = \`
                <h1>${options.title}</h1>
                <p>Interactive graph visualization • \${data.nodes.length} nodes • \${data.edges.length} edges</p>
            \`;
            
            // Create content area
            const content = document.createElement('div');
            content.className = 'iframe-visualization';
            content.style.padding = '20px';
            content.style.overflow = 'auto';
            
            // Create SVG-based graph visualization
            const graphContainer = document.createElement('div');
            graphContainer.style.background = 'white';
            graphContainer.style.borderRadius = '8px';
            graphContainer.style.padding = '20px';
            graphContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            graphContainer.style.position = 'relative';
            
            // Calculate layout positions for nodes
            const nodePositions = calculateNodeLayout(data.nodes, data.edges);
            
            // Create SVG for the graph
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.width = '100%';
            svg.style.height = '400px';
            svg.style.border = '1px solid #e0e0e0';
            svg.style.borderRadius = '8px';
            svg.style.background = '#fafafa';
            
            // Add edges first (so they appear behind nodes)
            data.edges.forEach(edge => {
                const sourcePos = nodePositions[edge.source];
                const targetPos = nodePositions[edge.target];
                
                if (sourcePos && targetPos) {
                    // Create edge line
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', sourcePos.x);
                    line.setAttribute('y1', sourcePos.y);
                    line.setAttribute('x2', targetPos.x);
                    line.setAttribute('y2', targetPos.y);
                    line.setAttribute('stroke', edge.style.stroke);
                    line.setAttribute('stroke-width', edge.style.strokeWidth);
                    line.setAttribute('marker-end', 'url(#arrowhead)');
                    line.setAttribute('data-edge-id', edge.id);
                    svg.appendChild(line);
                    
                    // Add edge label group
                    const midX = (sourcePos.x + targetPos.x) / 2;
                    const midY = (sourcePos.y + targetPos.y) / 2;
                    
                    const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    labelGroup.setAttribute('data-edge-label', edge.id);
                    
                    const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    labelBg.setAttribute('x', midX - 35);
                    labelBg.setAttribute('y', midY - 10);
                    labelBg.setAttribute('width', 70);
                    labelBg.setAttribute('height', 20);
                    labelBg.setAttribute('fill', 'white');
                    labelBg.setAttribute('stroke', '#ddd');
                    labelBg.setAttribute('rx', 4);
                    
                    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label.setAttribute('x', midX);
                    label.setAttribute('y', midY + 4);
                    label.setAttribute('text-anchor', 'middle');
                    label.setAttribute('font-size', '10');
                    label.setAttribute('font-weight', 'bold');
                    label.setAttribute('fill', '#666');
                    label.textContent = edge.data.label;
                    
                    labelGroup.appendChild(labelBg);
                    labelGroup.appendChild(label);
                    svg.appendChild(labelGroup);
                }
            });
            
            // Add arrow marker definition
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'arrowhead');
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '7');
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '3.5');
            marker.setAttribute('orient', 'auto');
            
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
            polygon.setAttribute('fill', '#999');
            marker.appendChild(polygon);
            defs.appendChild(marker);
            svg.appendChild(defs);
            
            // Add nodes on top of edges with drag functionality
            let selectedNode = null;
            let isDragging = false;
            let dragOffset = { x: 0, y: 0 };
            
            data.nodes.forEach(node => {
                const pos = nodePositions[node.id];
                if (pos) {
                    // Create node group for easier manipulation
                    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    nodeGroup.setAttribute('data-node-id', node.id);
                    nodeGroup.style.cursor = 'grab';
                    
                    // Node circle
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('cx', pos.x);
                    circle.setAttribute('cy', pos.y);
                    circle.setAttribute('r', 25);
                    circle.setAttribute('fill', node.data.color);
                    circle.setAttribute('stroke', 'white');
                    circle.setAttribute('stroke-width', 3);
                    circle.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
                    
                    // Node label
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', pos.x);
                    text.setAttribute('y', pos.y + 4);
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('font-size', '12');
                    text.setAttribute('font-weight', 'bold');
                    text.setAttribute('fill', 'white');
                    text.textContent = node.data.label.length > 8 ? 
                        node.data.label.substring(0, 8) + '...' : node.data.label;
                    text.style.pointerEvents = 'none';
                    
                    nodeGroup.appendChild(circle);
                    nodeGroup.appendChild(text);
                    
                    // Add hover effects
                    nodeGroup.addEventListener('mouseenter', () => {
                        if (!isDragging) {
                            circle.setAttribute('r', 30);
                            circle.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))';
                        }
                    });
                    nodeGroup.addEventListener('mouseleave', () => {
                        if (!isDragging) {
                            circle.setAttribute('r', 25);
                            circle.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
                        }
                    });
                    
                    // Click to show details
                    nodeGroup.addEventListener('click', (e) => {
                        if (!isDragging) {
                            showNodeDetails(node, e);
                        }
                    });
                    
                    // Drag functionality
                    nodeGroup.addEventListener('mousedown', (e) => {
                        isDragging = true;
                        selectedNode = { group: nodeGroup, circle, text, nodeId: node.id };
                        nodeGroup.style.cursor = 'grabbing';
                        
                        const rect = svg.getBoundingClientRect();
                        const currentX = parseFloat(circle.getAttribute('cx'));
                        const currentY = parseFloat(circle.getAttribute('cy'));
                        dragOffset.x = (e.clientX - rect.left) - currentX;
                        dragOffset.y = (e.clientY - rect.top) - currentY;
                        
                        e.preventDefault();
                    });
                    
                    svg.appendChild(nodeGroup);
                }
            });
            
            // Global mouse events for dragging
            svg.addEventListener('mousemove', (e) => {
                if (isDragging && selectedNode) {
                    const rect = svg.getBoundingClientRect();
                    const newX = (e.clientX - rect.left) - dragOffset.x;
                    const newY = (e.clientY - rect.top) - dragOffset.y;
                    
                    // Keep node within SVG bounds
                    const margin = 30;
                    const boundedX = Math.max(margin, Math.min(600 - margin, newX));
                    const boundedY = Math.max(margin, Math.min(350 - margin, newY));
                    
                    // Update node position
                    selectedNode.circle.setAttribute('cx', boundedX);
                    selectedNode.circle.setAttribute('cy', boundedY);
                    selectedNode.text.setAttribute('x', boundedX);
                    selectedNode.text.setAttribute('y', boundedY + 4);
                    
                    // Update node position in data
                    nodePositions[selectedNode.nodeId] = { x: boundedX, y: boundedY };
                    
                    // Update connected edges
                    updateEdgePositions();
                }
            });
            
            svg.addEventListener('mouseup', () => {
                if (isDragging && selectedNode) {
                    selectedNode.group.style.cursor = 'grab';
                    selectedNode.circle.setAttribute('r', 25);
                    selectedNode.circle.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
                }
                isDragging = false;
                selectedNode = null;
            });
            
            // Function to update edge positions when nodes are dragged
            function updateEdgePositions() {
                const lines = svg.querySelectorAll('line[data-edge-id]');
                const labels = svg.querySelectorAll('g[data-edge-label]');
                
                lines.forEach(line => {
                    const edgeId = line.getAttribute('data-edge-id');
                    const edge = data.edges.find(e => e.id === edgeId);
                    if (edge) {
                        const sourcePos = nodePositions[edge.source];
                        const targetPos = nodePositions[edge.target];
                        if (sourcePos && targetPos) {
                            line.setAttribute('x1', sourcePos.x);
                            line.setAttribute('y1', sourcePos.y);
                            line.setAttribute('x2', targetPos.x);
                            line.setAttribute('y2', targetPos.y);
                        }
                    }
                });
                
                labels.forEach(labelGroup => {
                    const edgeId = labelGroup.getAttribute('data-edge-label');
                    const edge = data.edges.find(e => e.id === edgeId);
                    if (edge) {
                        const sourcePos = nodePositions[edge.source];
                        const targetPos = nodePositions[edge.target];
                        if (sourcePos && targetPos) {
                            const midX = (sourcePos.x + targetPos.x) / 2;
                            const midY = (sourcePos.y + targetPos.y) / 2;
                            
                            const rect = labelGroup.querySelector('rect');
                            const text = labelGroup.querySelector('text');
                            if (rect && text) {
                                rect.setAttribute('x', midX - 35);
                                rect.setAttribute('y', midY - 10);
                                text.setAttribute('x', midX);
                                text.setAttribute('y', midY + 4);
                            }
                        }
                    }
                });
            }
            
            // Function to show node details
            function showNodeDetails(node, event) {
                // Remove existing detail popup
                const existingPopup = document.querySelector('.node-detail-popup');
                if (existingPopup) {
                    existingPopup.remove();
                }
                
                // Create detail popup
                const popup = document.createElement('div');
                popup.className = 'node-detail-popup';
                popup.style.cssText = \`
                    position: fixed;
                    background: white;
                    border: 2px solid \${node.data.color};
                    border-radius: 8px;
                    padding: 15px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    z-index: 10000;
                    max-width: 300px;
                    font-family: inherit;
                \`;
                
                popup.innerHTML = \`
                    <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin: 0; color: #333; font-size: 16px;">\${node.data.label}</h3>
                        <button onclick="this.parentElement.parentElement.remove()" style="
                            background: none; border: none; font-size: 18px; 
                            cursor: pointer; color: #666; padding: 0; margin-left: 10px;
                        ">×</button>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 10px;">
                        \${node.data.nodeTypes.map(type => 
                            \`<span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">\${type}</span>\`
                        ).join('')}
                    </div>
                    <div style="font-size: 13px; color: #333;">
                        <strong>Properties:</strong>
                        <div style="margin-top: 8px; background: #f8f9fa; padding: 10px; border-radius: 4px;">
                            \${Object.entries(node.data.properties).map(([key, value]) => 
                                \`<div style="margin: 4px 0;"><strong>\${key}:</strong> \${value}</div>\`
                            ).join('')}
                        </div>
                    </div>
                    <div style="margin-top: 10px; font-size: 11px; color: #888;">
                        Click and drag the node to move it around!
                    </div>
                \`;
                
                // Position popup near the click
                const rect = svg.getBoundingClientRect();
                popup.style.left = (event.clientX + 10) + 'px';
                popup.style.top = (event.clientY - 50) + 'px';
                
                document.body.appendChild(popup);
                
                // Auto-remove after 5 seconds
                setTimeout(() => {
                    if (popup.parentElement) {
                        popup.remove();
                    }
                }, 5000);
            }
            
            graphContainer.appendChild(svg);
            
            // Add node details panel
            const detailsPanel = document.createElement('div');
            detailsPanel.style.marginTop = '20px';
            detailsPanel.style.display = 'grid';
            detailsPanel.style.gridTemplateColumns = 'repeat(auto-fit, minmax(250px, 1fr))';
            detailsPanel.style.gap = '15px';
            
            data.nodes.forEach(node => {
                const nodeCard = document.createElement('div');
                nodeCard.style.cssText = \`
                    padding: 15px;
                    border: 2px solid \${node.data.color};
                    border-radius: 8px;
                    background: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    transition: all 0.2s ease;
                \`;
                
                nodeCard.innerHTML = \`
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <div style="
                            width: 20px; height: 20px; border-radius: 50%;
                            background: \${node.data.color}; color: white;
                            display: flex; align-items: center; justify-content: center;
                            font-size: 10px; font-weight: bold;
                        ">\${node.data.icon ? node.data.icon.charAt(0).toUpperCase() : 'N'}</div>
                        <strong style="font-size: 16px; color: #333;">\${node.data.label}</strong>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                        \${node.data.nodeTypes.map(type => 
                            \`<span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">\${type}</span>\`
                        ).join('')}
                    </div>
                    <div style="font-size: 11px; color: #888;">
                        \${Object.entries(node.data.properties).map(([key, value]) => 
                            \`<div><strong>\${key}:</strong> \${value}</div>\`
                        ).join('')}
                    </div>
                \`;
                
                detailsPanel.appendChild(nodeCard);
            });
            
            graphContainer.appendChild(detailsPanel);
            
            // Add statistics
            const statsSection = document.createElement('div');
            statsSection.style.marginTop = '20px';
            statsSection.style.padding = '15px';
            statsSection.style.background = '#e3f2fd';
            statsSection.style.borderRadius = '8px';
            
            const nodeTypes = [...new Set(data.nodes.flatMap(n => n.data.nodeTypes))];
            const edgeTypes = [...new Set(data.edges.map(e => e.data.relationType))];
            
            statsSection.innerHTML = \`
                <h4 style="margin-top: 0; color: #1976d2;">Graph Statistics</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div>
                        <strong>Nodes:</strong> \${data.nodes.length}<br>
                        <strong>Node Types:</strong> \${nodeTypes.join(', ')}
                    </div>
                    <div>
                        <strong>Relationships:</strong> \${data.edges.length}<br>
                        <strong>Relationship Types:</strong> \${edgeTypes.join(', ')}
                    </div>
                </div>
            \`;
            
            graphContainer.appendChild(statsSection);
            content.appendChild(graphContainer);
            
            // Add note about full ReactFlow version
            const note = document.createElement('div');
            note.style.cssText = \`
                margin-top: 20px; padding: 15px; 
                background: #d4edda; border: 1px solid #c3e6cb;
                border-radius: 8px; font-size: 14px; color: #155724;
            \`;
            note.innerHTML = \`
                <strong>✅ Connected Graph Visualization!</strong> This shows nodes connected by relationships, 
                similar to ReactFlow. Hover over nodes to see interactive effects. The full ReactFlow version 
                would add drag-and-drop, zoom/pan, and advanced layout algorithms.
            \`;
            content.appendChild(note);
            
            // Clear container and add new content
            container.innerHTML = '';
            container.appendChild(header);
            container.appendChild(content);
        }
        
        function calculateNodeLayout(nodes, edges) {
            const positions = {};
            const svgWidth = 600;
            const svgHeight = 350;
            const margin = 60;
            
            if (nodes.length === 1) {
                positions[nodes[0].id] = { x: svgWidth / 2, y: svgHeight / 2 };
                return positions;
            }
            
            if (nodes.length === 2) {
                positions[nodes[0].id] = { x: svgWidth / 3, y: svgHeight / 2 };
                positions[nodes[1].id] = { x: (2 * svgWidth) / 3, y: svgHeight / 2 };
                return positions;
            }
            
            // For more complex layouts, use a simple force-directed approach
            const centerX = svgWidth / 2;
            const centerY = svgHeight / 2;
            const radius = Math.min(svgWidth, svgHeight) / 3;
            
            // Place nodes in a circle initially
            nodes.forEach((node, index) => {
                const angle = (2 * Math.PI * index) / nodes.length;
                positions[node.id] = {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
            });
            
            // Adjust positions based on connections
            for (let iteration = 0; iteration < 50; iteration++) {
                const forces = {};
                
                // Initialize forces
                nodes.forEach(node => {
                    forces[node.id] = { x: 0, y: 0 };
                });
                
                // Repulsion between all nodes
                nodes.forEach(nodeA => {
                    nodes.forEach(nodeB => {
                        if (nodeA.id !== nodeB.id) {
                            const dx = positions[nodeA.id].x - positions[nodeB.id].x;
                            const dy = positions[nodeA.id].y - positions[nodeB.id].y;
                            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                            const force = 1000 / (distance * distance);
                            
                            forces[nodeA.id].x += (dx / distance) * force;
                            forces[nodeA.id].y += (dy / distance) * force;
                        }
                    });
                });
                
                // Attraction along edges
                edges.forEach(edge => {
                    const dx = positions[edge.target].x - positions[edge.source].x;
                    const dy = positions[edge.target].y - positions[edge.source].y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = distance * 0.01;
                    
                    forces[edge.source].x += (dx / distance) * force;
                    forces[edge.source].y += (dy / distance) * force;
                    forces[edge.target].x -= (dx / distance) * force;
                    forces[edge.target].y -= (dy / distance) * force;
                });
                
                // Apply forces
                nodes.forEach(node => {
                    positions[node.id].x += forces[node.id].x * 0.1;
                    positions[node.id].y += forces[node.id].y * 0.1;
                    
                    // Keep nodes within bounds
                    positions[node.id].x = Math.max(margin, Math.min(svgWidth - margin, positions[node.id].x));
                    positions[node.id].y = Math.max(margin, Math.min(svgHeight - margin, positions[node.id].y));
                });
            }
            
            return positions;
        }
        
        // Create the fallback visualization immediately
        createFallbackVisualization();
    </script>
</body>
</html>`;
  }
}
