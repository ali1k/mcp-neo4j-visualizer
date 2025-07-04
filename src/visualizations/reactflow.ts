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

    // Generate standalone HTML if needed
    const htmlVisualization = this.generateReactFlowHTML(componentCode, processedData, {
      title,
      width,
      height
    });

    if (outputPath) {
      fs.writeFileSync(outputPath, htmlVisualization);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Generated ReactFlow lineage visualization with ${nodes.length} nodes and ${relationships.length} relationships.\n\nConfiguration:\n${JSON.stringify(config, null, 2)}\n\nReact Component:\n\n${componentCode}\n\n${outputPath ? `Saved HTML visualization to ${outputPath}\n\n` : ''}Standalone HTML:\n\n${htmlVisualization}`,
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
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.title}</title>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@xyflow/react@12/dist/umd/index.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/@xyflow/react@12/dist/style.css">
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #f5f5f5;
        }
        .container {
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            background: white;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 1000;
        }
        .visualization {
            flex: 1;
            position: relative;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script>
        const { useState, useCallback, useMemo } = React;
        const { 
          ReactFlow, 
          Background, 
          Controls, 
          MiniMap, 
          useNodesState, 
          useEdgesState, 
          Panel, 
          Handle, 
          Position,
          getBezierPath,
          EdgeLabelRenderer,
          addEdge
        } = ReactFlowLib;

        // Data from server
        const initialData = ${JSON.stringify(data, null, 2)};
        
        ${componentCode.replace('export default ReactFlowLineage;', '')}
        
        const App = () => {
          return (
            <div className="container">
              <div className="header">
                <h1 style={{ margin: 0, color: '#333' }}>${options.title}</h1>
                <p style={{ margin: '5px 0 0 0', color: '#666' }}>
                  Interactive ReactFlow lineage visualization with {initialData.nodes.length} nodes and {initialData.edges.length} edges
                </p>
              </div>
              <div className="visualization">
                <ReactFlowLineage 
                  initialNodes={initialData.nodes}
                  initialEdges={initialData.edges}
                  config={initialData.config}
                />
              </div>
            </div>
          );
        };
        
        ReactDOM.render(React.createElement(App), document.getElementById('root'));
    </script>
</body>
</html>`;
  }
}
