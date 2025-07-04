#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as d3 from 'd3';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

interface Neo4jNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

interface Neo4jRelationship {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties: Record<string, any>;
}

interface Neo4jQueryResult {
  nodes?: Neo4jNode[];
  relationships?: Neo4jRelationship[];
  records?: any[];
}

const isValidVisualizationArgs = (
  args: any
): args is { 
  data: Neo4jQueryResult; 
  type: 'graph' | 'table' | 'chart' | 'timeline';
  title?: string;
  width?: number;
  height?: number;
  outputPath?: string;
} =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.data === 'object' &&
  typeof args.type === 'string' &&
  ['graph', 'table', 'chart', 'timeline'].includes(args.type);

class Neo4jVisualizerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'neo4j-visualizer',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'visualize_neo4j_results',
          description: 'Create visualizations from Neo4j query results including graph networks, tables, charts, and timelines',
          inputSchema: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                description: 'Neo4j query results containing nodes, relationships, or records',
                properties: {
                  nodes: {
                    type: 'array',
                    description: 'Array of Neo4j nodes',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        labels: { 
                          type: 'array', 
                          items: { type: 'string' },
                          description: 'Node labels'
                        },
                        properties: { 
                          type: 'object',
                          description: 'Node properties',
                          additionalProperties: true
                        }
                      },
                      required: ['id', 'labels', 'properties'],
                      additionalProperties: false
                    }
                  },
                  relationships: {
                    type: 'array',
                    description: 'Array of Neo4j relationships',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        type: { type: 'string' },
                        startNodeId: { type: 'string' },
                        endNodeId: { type: 'string' },
                        properties: { 
                          type: 'object',
                          description: 'Relationship properties',
                          additionalProperties: true
                        }
                      },
                      required: ['id', 'type', 'startNodeId', 'endNodeId', 'properties'],
                      additionalProperties: false
                    }
                  },
                  records: {
                    type: 'array',
                    description: 'Array of query result records',
                    items: {
                      type: 'object',
                      description: 'Query result record',
                      additionalProperties: true
                    }
                  }
                }
              },
              type: {
                type: 'string',
                enum: ['graph', 'table', 'chart', 'timeline'],
                description: 'Type of visualization to create'
              },
              title: {
                type: 'string',
                description: 'Title for the visualization',
                default: 'Neo4j Query Results'
              },
              width: {
                type: 'number',
                description: 'Width of the visualization in pixels',
                default: 800
              },
              height: {
                type: 'number',
                description: 'Height of the visualization in pixels',
                default: 600
              },
              outputPath: {
                type: 'string',
                description: 'Optional file path to save the visualization (HTML format)'
              }
            },
            required: ['data', 'type']
          }
        },
        {
          name: 'create_graph_network',
          description: 'Create an interactive network graph visualization from Neo4j nodes and relationships',
          inputSchema: {
            type: 'object',
            properties: {
              nodes: {
                type: 'array',
                description: 'Array of Neo4j nodes',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    labels: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'Node labels'
                    },
                    properties: { 
                      type: 'object',
                      description: 'Node properties',
                      additionalProperties: true
                    }
                  },
                  required: ['id', 'labels', 'properties'],
                  additionalProperties: false
                }
              },
              relationships: {
                type: 'array',
                description: 'Array of Neo4j relationships',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    startNodeId: { type: 'string' },
                    endNodeId: { type: 'string' },
                    properties: { 
                      type: 'object',
                      description: 'Relationship properties',
                      additionalProperties: true
                    }
                  },
                  required: ['id', 'type', 'startNodeId', 'endNodeId', 'properties'],
                  additionalProperties: false
                }
              },
              title: { type: 'string', default: 'Neo4j Graph Network' },
              width: { type: 'number', default: 800 },
              height: { type: 'number', default: 600 },
              outputPath: { type: 'string' }
            },
            required: ['nodes', 'relationships']
          }
        },
        {
          name: 'create_data_table',
          description: 'Create a formatted table from Neo4j query records',
          inputSchema: {
            type: 'object',
            properties: {
              records: {
                type: 'array',
                description: 'Array of query result records',
                items: {
                  type: 'object',
                  description: 'Query result record',
                  additionalProperties: true
                }
              },
              title: { type: 'string', default: 'Neo4j Query Results' },
              outputPath: { type: 'string' }
            },
            required: ['records']
          }
        },
        {
          name: 'get_visualization_component',
          description: 'Get React component code and data for embedding visualizations in your UI',
          inputSchema: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                description: 'Neo4j query results containing nodes, relationships, or records',
                properties: {
                  nodes: {
                    type: 'array',
                    description: 'Array of Neo4j nodes',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        labels: { 
                          type: 'array', 
                          items: { type: 'string' },
                          description: 'Node labels'
                        },
                        properties: { 
                          type: 'object',
                          description: 'Node properties',
                          additionalProperties: true
                        }
                      },
                      required: ['id', 'labels', 'properties'],
                      additionalProperties: false
                    }
                  },
                  relationships: {
                    type: 'array',
                    description: 'Array of Neo4j relationships',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        type: { type: 'string' },
                        startNodeId: { type: 'string' },
                        endNodeId: { type: 'string' },
                        properties: { 
                          type: 'object',
                          description: 'Relationship properties',
                          additionalProperties: true
                        }
                      },
                      required: ['id', 'type', 'startNodeId', 'endNodeId', 'properties'],
                      additionalProperties: false
                    }
                  },
                  records: {
                    type: 'array',
                    description: 'Array of query result records',
                    items: {
                      type: 'object',
                      description: 'Query result record',
                      additionalProperties: true
                    }
                  }
                },
                additionalProperties: false
              },
              type: {
                type: 'string',
                enum: ['graph', 'table', 'chart', 'timeline'],
                description: 'Type of visualization component to generate'
              },
              componentName: {
                type: 'string',
                description: 'Name for the React component',
                default: 'Neo4jVisualization'
              },
              width: { type: 'number', default: 800 },
              height: { type: 'number', default: 600 }
            },
            required: ['data', 'type']
          }
        },
        {
          name: 'get_d3_visualization_data',
          description: 'Get processed data and D3.js code for direct integration into existing React components',
          inputSchema: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                description: 'Neo4j query results containing nodes, relationships, or records',
                properties: {
                  nodes: {
                    type: 'array',
                    description: 'Array of Neo4j nodes',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        labels: { 
                          type: 'array', 
                          items: { type: 'string' },
                          description: 'Node labels'
                        },
                        properties: { 
                          type: 'object',
                          description: 'Node properties',
                          additionalProperties: true
                        }
                      },
                      required: ['id', 'labels', 'properties'],
                      additionalProperties: false
                    }
                  },
                  relationships: {
                    type: 'array',
                    description: 'Array of Neo4j relationships',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        type: { type: 'string' },
                        startNodeId: { type: 'string' },
                        endNodeId: { type: 'string' },
                        properties: { 
                          type: 'object',
                          description: 'Relationship properties',
                          additionalProperties: true
                        }
                      },
                      required: ['id', 'type', 'startNodeId', 'endNodeId', 'properties'],
                      additionalProperties: false
                    }
                  },
                  records: {
                    type: 'array',
                    description: 'Array of query result records',
                    items: {
                      type: 'object',
                      description: 'Query result record',
                      additionalProperties: true
                    }
                  }
                },
                additionalProperties: false
              },
              type: {
                type: 'string',
                enum: ['graph', 'table', 'chart', 'timeline'],
                description: 'Type of visualization data to process'
              }
            },
            required: ['data', 'type']
          }
        },
        {
          name: 'create_3d_graph_network',
          description: 'Create an immersive 3D network graph visualization using Three.js and React-Three-Fiber',
          inputSchema: {
            type: 'object',
            properties: {
              nodes: {
                type: 'array',
                description: 'Array of Neo4j nodes',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    labels: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'Node labels'
                    },
                    properties: { 
                      type: 'object',
                      description: 'Node properties',
                      additionalProperties: true
                    }
                  },
                  required: ['id', 'labels', 'properties'],
                  additionalProperties: false
                }
              },
              relationships: {
                type: 'array',
                description: 'Array of Neo4j relationships',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    startNodeId: { type: 'string' },
                    endNodeId: { type: 'string' },
                    properties: { 
                      type: 'object',
                      description: 'Relationship properties',
                      additionalProperties: true
                    }
                  },
                  required: ['id', 'type', 'startNodeId', 'endNodeId', 'properties'],
                  additionalProperties: false
                }
              },
              title: { type: 'string', default: '3D Neo4j Graph Network' },
              enablePhysics: { type: 'boolean', default: true },
              enableVR: { type: 'boolean', default: false },
              nodeSize: { type: 'number', default: 1 },
              linkDistance: { type: 'number', default: 30 }
            },
            required: ['nodes', 'relationships']
          }
        },
        {
          name: 'create_path_visualization',
          description: 'Create animated path visualizations for shortest paths, relationship chains, and graph traversals',
          inputSchema: {
            type: 'object',
            properties: {
              nodes: {
                type: 'array',
                description: 'Array of Neo4j nodes',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    labels: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'Node labels'
                    },
                    properties: { 
                      type: 'object',
                      description: 'Node properties',
                      additionalProperties: true
                    }
                  },
                  required: ['id', 'labels', 'properties'],
                  additionalProperties: false
                }
              },
              relationships: {
                type: 'array',
                description: 'Array of Neo4j relationships',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    startNodeId: { type: 'string' },
                    endNodeId: { type: 'string' },
                    properties: { 
                      type: 'object',
                      description: 'Relationship properties',
                      additionalProperties: true
                    }
                  },
                  required: ['id', 'type', 'startNodeId', 'endNodeId', 'properties'],
                  additionalProperties: false
                }
              },
              paths: {
                type: 'array',
                description: 'Array of paths to highlight',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    nodeIds: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Ordered array of node IDs in the path'
                    },
                    relationshipIds: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Ordered array of relationship IDs in the path'
                    },
                    color: { type: 'string', default: '#ff6b35' },
                    weight: { type: 'number', default: 1 }
                  },
                  required: ['id', 'nodeIds', 'relationshipIds'],
                  additionalProperties: false
                }
              },
              title: { type: 'string', default: 'Neo4j Path Visualization' },
              animationSpeed: { type: 'number', default: 1000 },
              showSteps: { type: 'boolean', default: true }
            },
            required: ['nodes', 'relationships', 'paths']
          }
        },
        {
          name: 'create_sankey_diagram',
          description: 'Create Sankey flow diagrams for visualizing weighted relationships and data flows',
          inputSchema: {
            type: 'object',
            properties: {
              flows: {
                type: 'array',
                description: 'Array of flow data between nodes',
                items: {
                  type: 'object',
                  properties: {
                    source: { type: 'string', description: 'Source node ID' },
                    target: { type: 'string', description: 'Target node ID' },
                    value: { type: 'number', description: 'Flow value/weight' },
                    label: { type: 'string', description: 'Flow label' }
                  },
                  required: ['source', 'target', 'value'],
                  additionalProperties: false
                }
              },
              nodes: {
                type: 'array',
                description: 'Array of node definitions',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    category: { type: 'string' },
                    color: { type: 'string' }
                  },
                  required: ['id', 'name'],
                  additionalProperties: false
                }
              },
              title: { type: 'string', default: 'Neo4j Sankey Flow Diagram' },
              width: { type: 'number', default: 800 },
              height: { type: 'number', default: 600 },
              nodeWidth: { type: 'number', default: 15 },
              nodePadding: { type: 'number', default: 10 }
            },
            required: ['flows', 'nodes']
          }
        },
        {
          name: 'create_hierarchical_tree',
          description: 'Create hierarchical tree visualizations including collapsible trees, radial trees, and sunburst diagrams',
          inputSchema: {
            type: 'object',
            properties: {
              treeData: {
                type: 'object',
                description: 'Hierarchical tree structure',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  value: { type: 'number' },
                  children: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Child nodes (recursive structure)'
                  },
                  properties: {
                    type: 'object',
                    additionalProperties: true
                  }
                },
                required: ['id', 'name'],
                additionalProperties: true
              },
              visualizationType: {
                type: 'string',
                enum: ['tree', 'radial', 'sunburst', 'treemap'],
                description: 'Type of hierarchical visualization'
              },
              title: { type: 'string', default: 'Neo4j Hierarchical Visualization' },
              width: { type: 'number', default: 800 },
              height: { type: 'number', default: 600 },
              interactive: { type: 'boolean', default: true },
              showLabels: { type: 'boolean', default: true }
            },
            required: ['treeData', 'visualizationType']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'visualize_neo4j_results':
            return await this.handleVisualization(request.params.arguments);
          case 'create_graph_network':
            return await this.handleGraphNetwork(request.params.arguments);
          case 'create_data_table':
            return await this.handleDataTable(request.params.arguments);
          case 'get_visualization_component':
            return await this.handleVisualizationComponent(request.params.arguments);
          case 'get_d3_visualization_data':
            return await this.handleD3VisualizationData(request.params.arguments);
          case 'create_3d_graph_network':
            return await this.handle3DGraphNetwork(request.params.arguments);
          case 'create_path_visualization':
            return await this.handlePathVisualization(request.params.arguments);
          case 'create_sankey_diagram':
            return await this.handleSankeyDiagram(request.params.arguments);
          case 'create_hierarchical_tree':
            return await this.handleHierarchicalTree(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        console.error(`Tool execution error:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleVisualization(args: any) {
    if (!isValidVisualizationArgs(args)) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid visualization arguments');
    }

    const { data, type, title = 'Neo4j Query Results', width = 800, height = 600, outputPath } = args;

    let html = '';
    let description = '';

    switch (type) {
      case 'graph':
        if (data.nodes && data.relationships) {
          html = this.createGraphVisualization(data.nodes, data.relationships, title, width, height);
          description = `Created interactive graph network with ${data.nodes.length} nodes and ${data.relationships.length} relationships`;
        } else {
          throw new Error('Graph visualization requires nodes and relationships data');
        }
        break;
      case 'table':
        if (data.records) {
          html = this.createTableVisualization(data.records, title);
          description = `Created data table with ${data.records.length} records`;
        } else {
          throw new Error('Table visualization requires records data');
        }
        break;
      case 'chart':
        html = this.createChartVisualization(data, title, width, height);
        description = 'Created chart visualization from query results';
        break;
      case 'timeline':
        html = this.createTimelineVisualization(data, title, width, height);
        description = 'Created timeline visualization from query results';
        break;
    }

    if (outputPath) {
      fs.writeFileSync(outputPath, html);
      description += ` and saved to ${outputPath}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: `${description}\n\nVisualization HTML:\n${html}`,
        },
      ],
    };
  }

  private async handleGraphNetwork(args: any) {
    const { nodes, relationships, title = 'Neo4j Graph Network', width = 800, height = 600, outputPath } = args;
    
    const html = this.createGraphVisualization(nodes, relationships, title, width, height);
    
    if (outputPath) {
      fs.writeFileSync(outputPath, html);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Created interactive graph network with ${nodes.length} nodes and ${relationships.length} relationships${outputPath ? ` and saved to ${outputPath}` : ''}\n\nVisualization HTML:\n${html}`,
        },
      ],
    };
  }

  private async handleDataTable(args: any) {
    const { records, title = 'Neo4j Query Results', outputPath } = args;
    
    const html = this.createTableVisualization(records, title);
    
    if (outputPath) {
      fs.writeFileSync(outputPath, html);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Created data table with ${records.length} records${outputPath ? ` and saved to ${outputPath}` : ''}\n\nVisualization HTML:\n${html}`,
        },
      ],
    };
  }

  private createGraphVisualization(nodes: Neo4jNode[], relationships: Neo4jRelationship[], title: string, width: number, height: number): string {
    // Transform Neo4j data for D3
    const d3Nodes = nodes.map(node => ({
      id: node.id,
      label: node.labels.join(', '),
      properties: node.properties,
      group: node.labels[0] || 'default'
    }));

    const d3Links = relationships.map(rel => ({
      source: rel.startNodeId,
      target: rel.endNodeId,
      type: rel.type,
      properties: rel.properties
    }));

    return `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .node { stroke: #fff; stroke-width: 2px; cursor: pointer; }
        .link { stroke: #999; stroke-opacity: 0.6; }
        .node-label { font-size: 12px; text-anchor: middle; pointer-events: none; }
        .link-label { font-size: 10px; text-anchor: middle; pointer-events: none; }
        .tooltip { position: absolute; padding: 10px; background: rgba(0,0,0,0.8); color: white; border-radius: 5px; pointer-events: none; opacity: 0; }
        .legend { position: absolute; top: 10px; right: 10px; background: white; padding: 10px; border: 1px solid #ccc; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div id="graph"></div>
    <div class="tooltip" id="tooltip"></div>
    <div class="legend" id="legend"></div>
    
    <script>
        const nodes = ${JSON.stringify(d3Nodes)};
        const links = ${JSON.stringify(d3Links)};
        
        const width = ${width};
        const height = ${height};
        
        const color = d3.scaleOrdinal(d3.schemeCategory10);
        
        const svg = d3.select("#graph")
            .append("svg")
            .attr("width", width)
            .attr("height", height);
            
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2));
            
        const link = svg.append("g")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke-width", 2);
            
        const linkLabel = svg.append("g")
            .selectAll("text")
            .data(links)
            .enter().append("text")
            .attr("class", "link-label")
            .text(d => d.type);
            
        const node = svg.append("g")
            .selectAll("circle")
            .data(nodes)
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", 20)
            .attr("fill", d => color(d.group))
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));
                
        const nodeLabel = svg.append("g")
            .selectAll("text")
            .data(nodes)
            .enter().append("text")
            .attr("class", "node-label")
            .text(d => d.properties.name || d.properties.title || d.id);
            
        const tooltip = d3.select("#tooltip");
        
        node.on("mouseover", function(event, d) {
            tooltip.transition().duration(200).style("opacity", .9);
            tooltip.html(\`
                <strong>\${d.label}</strong><br/>
                ID: \${d.id}<br/>
                \${Object.entries(d.properties).map(([k,v]) => \`\${k}: \${v}\`).join('<br/>')}
            \`)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(d) {
            tooltip.transition().duration(500).style("opacity", 0);
        });
        
        // Create legend
        const legend = d3.select("#legend");
        const groups = [...new Set(nodes.map(d => d.group))];
        groups.forEach((group, i) => {
            const legendItem = legend.append("div").style("margin", "5px 0");
            legendItem.append("span")
                .style("display", "inline-block")
                .style("width", "20px")
                .style("height", "20px")
                .style("background-color", color(group))
                .style("margin-right", "10px");
            legendItem.append("span").text(group);
        });
        
        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
                
            linkLabel
                .attr("x", d => (d.source.x + d.target.x) / 2)
                .attr("y", d => (d.source.y + d.target.y) / 2);
                
            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
                
            nodeLabel
                .attr("x", d => d.x)
                .attr("y", d => d.y + 5);
        });
        
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    </script>
</body>
</html>`;
  }

  private createTableVisualization(records: any[], title: string): string {
    if (!records || records.length === 0) {
      return `<html><body><h1>${title}</h1><p>No data to display</p></body></html>`;
    }

    // Get all unique keys from records
    const allKeys = new Set<string>();
    records.forEach(record => {
      Object.keys(record).forEach(key => allKeys.add(key));
    });
    const headers = Array.from(allKeys);

    const tableRows = records.map(record => {
      const cells = headers.map(header => {
        const value = record[header];
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }
        return value || '';
      });
      return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        tr:hover { background-color: #f5f5f5; }
        .stats { margin-top: 20px; padding: 10px; background-color: #e9ecef; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="stats">
        <strong>Total Records:</strong> ${records.length} | 
        <strong>Columns:</strong> ${headers.length}
    </div>
    <table>
        <thead>
            <tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>
</body>
</html>`;
  }

  private createChartVisualization(data: any, title: string, width: number, height: number): string {
    // Process the data to determine the best chart type and extract chart data
    const chartData = this.processChartData(data);
    
    if (!chartData || chartData.length === 0) {
      return this.createEmptyChart(title, width, height, "No data available for chart visualization");
    }

    // Determine chart type based on data structure
    const chartType = this.determineChartType(chartData);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            background-color: #f8f9fa;
        }
        .chart-container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
            margin: 20px 0;
        }
        .bar { 
            fill: steelblue; 
            transition: fill 0.3s ease;
        }
        .bar:hover { 
            fill: #ff6b35; 
            cursor: pointer;
        }
        .line {
            fill: none;
            stroke: steelblue;
            stroke-width: 2px;
        }
        .dot {
            fill: steelblue;
            stroke: white;
            stroke-width: 2px;
        }
        .dot:hover {
            fill: #ff6b35;
            r: 6;
            cursor: pointer;
        }
        .pie-slice {
            stroke: white;
            stroke-width: 2px;
            cursor: pointer;
        }
        .pie-slice:hover {
            opacity: 0.8;
        }
        .axis { 
            font-size: 12px; 
        }
        .axis-label {
            font-size: 14px;
            font-weight: bold;
        }
        .chart-title {
            font-size: 18px;
            font-weight: bold;
            text-anchor: middle;
            fill: #333;
        }
        .tooltip { 
            position: absolute; 
            padding: 12px; 
            background: rgba(0,0,0,0.9); 
            color: white; 
            border-radius: 6px; 
            pointer-events: none; 
            opacity: 0;
            font-size: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: opacity 0.3s ease;
        }
        .legend {
            font-size: 12px;
        }
        .legend-item {
            cursor: pointer;
        }
        .legend-item:hover {
            opacity: 0.7;
        }
        .chart-info {
            background: #e9ecef;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 15px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="chart-container">
        <div class="chart-info">
            <strong>Chart Type:</strong> ${chartType} | 
            <strong>Data Points:</strong> ${chartData.length}
        </div>
        <div id="chart"></div>
    </div>
    <div class="tooltip" id="tooltip"></div>
    
    <script>
        const rawData = ${JSON.stringify(data)};
        const chartData = ${JSON.stringify(chartData)};
        const chartType = "${chartType}";
        const width = ${width};
        const height = ${height};
        
        console.log('Raw data:', rawData);
        console.log('Processed chart data:', chartData);
        console.log('Chart type:', chartType);
        
        // Create the appropriate chart based on type
        switch(chartType) {
            case 'bar':
                createBarChart();
                break;
            case 'pie':
                createPieChart();
                break;
            case 'line':
                createLineChart();
                break;
            case 'scatter':
                createScatterPlot();
                break;
            case 'histogram':
                createHistogram();
                break;
            default:
                createBarChart(); // Default to bar chart
        }
        
        function createBarChart() {
            const margin = {top: 60, right: 30, bottom: 80, left: 80};
            const innerWidth = width - margin.left - margin.right;
            const innerHeight = height - margin.top - margin.bottom;
            
            const svg = d3.select("#chart")
                .append("svg")
                .attr("width", width)
                .attr("height", height);
                
            const g = svg.append("g")
                .attr("transform", \`translate(\${margin.left},\${margin.top})\`);
            
            // Add title
            svg.append("text")
                .attr("class", "chart-title")
                .attr("x", width / 2)
                .attr("y", 30)
                .text("${title}");
            
            const xScale = d3.scaleBand()
                .domain(chartData.map(d => d.label))
                .range([0, innerWidth])
                .padding(0.1);
                
            const yScale = d3.scaleLinear()
                .domain([0, d3.max(chartData, d => d.value)])
                .nice()
                .range([innerHeight, 0]);
            
            const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
            
            // Add bars
            g.selectAll(".bar")
                .data(chartData)
                .enter().append("rect")
                .attr("class", "bar")
                .attr("x", d => xScale(d.label))
                .attr("width", xScale.bandwidth())
                .attr("y", d => yScale(d.value))
                .attr("height", d => innerHeight - yScale(d.value))
                .attr("fill", (d, i) => colorScale(i))
                .on("mouseover", handleMouseOver)
                .on("mouseout", handleMouseOut);
            
            // Add x axis
            g.append("g")
                .attr("class", "axis")
                .attr("transform", \`translate(0,\${innerHeight})\`)
                .call(d3.axisBottom(xScale))
                .selectAll("text")
                .style("text-anchor", "end")
                .attr("dx", "-.8em")
                .attr("dy", ".15em")
                .attr("transform", "rotate(-45)");
            
            // Add y axis
            g.append("g")
                .attr("class", "axis")
                .call(d3.axisLeft(yScale));
            
            // Add axis labels
            g.append("text")
                .attr("class", "axis-label")
                .attr("transform", "rotate(-90)")
                .attr("y", 0 - margin.left)
                .attr("x", 0 - (innerHeight / 2))
                .attr("dy", "1em")
                .style("text-anchor", "middle")
                .text("Value");
            
            g.append("text")
                .attr("class", "axis-label")
                .attr("transform", \`translate(\${innerWidth / 2}, \${innerHeight + margin.bottom - 10})\`)
                .style("text-anchor", "middle")
                .text("Category");
        }
        
        function createPieChart() {
            const radius = Math.min(width, height) / 2 - 40;
            
            const svg = d3.select("#chart")
                .append("svg")
                .attr("width", width)
                .attr("height", height);
            
            const g = svg.append("g")
                .attr("transform", \`translate(\${width/2},\${height/2})\`);
            
            // Add title
            svg.append("text")
                .attr("class", "chart-title")
                .attr("x", width / 2)
                .attr("y", 30)
                .text("${title}");
            
            const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
            
            const pie = d3.pie()
                .value(d => d.value)
                .sort(null);
            
            const arc = d3.arc()
                .innerRadius(0)
                .outerRadius(radius);
            
            const arcs = g.selectAll(".pie-slice")
                .data(pie(chartData))
                .enter().append("g")
                .attr("class", "pie-slice");
            
            arcs.append("path")
                .attr("d", arc)
                .attr("fill", (d, i) => colorScale(i))
                .on("mouseover", handleMouseOver)
                .on("mouseout", handleMouseOut);
            
            // Add labels
            arcs.append("text")
                .attr("transform", d => \`translate(\${arc.centroid(d)})\`)
                .attr("text-anchor", "middle")
                .attr("font-size", "12px")
                .text(d => d.data.label);
            
            // Add legend
            const legend = svg.append("g")
                .attr("class", "legend")
                .attr("transform", \`translate(\${width - 120}, 50)\`);
            
            const legendItems = legend.selectAll(".legend-item")
                .data(chartData)
                .enter().append("g")
                .attr("class", "legend-item")
                .attr("transform", (d, i) => \`translate(0, \${i * 20})\`);
            
            legendItems.append("rect")
                .attr("width", 15)
                .attr("height", 15)
                .attr("fill", (d, i) => colorScale(i));
            
            legendItems.append("text")
                .attr("x", 20)
                .attr("y", 12)
                .text(d => d.label);
        }
        
        function createLineChart() {
            const margin = {top: 60, right: 30, bottom: 50, left: 80};
            const innerWidth = width - margin.left - margin.right;
            const innerHeight = height - margin.top - margin.bottom;
            
            const svg = d3.select("#chart")
                .append("svg")
                .attr("width", width)
                .attr("height", height);
                
            const g = svg.append("g")
                .attr("transform", \`translate(\${margin.left},\${margin.top})\`);
            
            // Add title
            svg.append("text")
                .attr("class", "chart-title")
                .attr("x", width / 2)
                .attr("y", 30)
                .text("${title}");
            
            const xScale = d3.scalePoint()
                .domain(chartData.map(d => d.label))
                .range([0, innerWidth]);
                
            const yScale = d3.scaleLinear()
                .domain(d3.extent(chartData, d => d.value))
                .nice()
                .range([innerHeight, 0]);
            
            const line = d3.line()
                .x(d => xScale(d.label))
                .y(d => yScale(d.value))
                .curve(d3.curveMonotoneX);
            
            // Add line
            g.append("path")
                .datum(chartData)
                .attr("class", "line")
                .attr("d", line);
            
            // Add dots
            g.selectAll(".dot")
                .data(chartData)
                .enter().append("circle")
                .attr("class", "dot")
                .attr("cx", d => xScale(d.label))
                .attr("cy", d => yScale(d.value))
                .attr("r", 4)
                .on("mouseover", handleMouseOver)
                .on("mouseout", handleMouseOut);
            
            // Add axes
            g.append("g")
                .attr("class", "axis")
                .attr("transform", \`translate(0,\${innerHeight})\`)
                .call(d3.axisBottom(xScale));
            
            g.append("g")
                .attr("class", "axis")
                .call(d3.axisLeft(yScale));
        }
        
        function createScatterPlot() {
            const margin = {top: 60, right: 30, bottom: 50, left: 80};
            const innerWidth = width - margin.left - margin.right;
            const innerHeight = height - margin.top - margin.bottom;
            
            const svg = d3.select("#chart")
                .append("svg")
                .attr("width", width)
                .attr("height", height);
                
            const g = svg.append("g")
                .attr("transform", \`translate(\${margin.left},\${margin.top})\`);
            
            // Add title
            svg.append("text")
                .attr("class", "chart-title")
                .attr("x", width / 2)
                .attr("y", 30)
                .text("${title}");
            
            const xScale = d3.scaleLinear()
                .domain(d3.extent(chartData, d => d.x || d.value))
                .nice()
                .range([0, innerWidth]);
                
            const yScale = d3.scaleLinear()
                .domain(d3.extent(chartData, d => d.y || d.value))
                .nice()
                .range([innerHeight, 0]);
            
            const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
            
            // Add dots
            g.selectAll(".dot")
                .data(chartData)
                .enter().append("circle")
                .attr("class", "dot")
                .attr("cx", d => xScale(d.x || d.value))
                .attr("cy", d => yScale(d.y || d.value))
                .attr("r", 5)
                .attr("fill", (d, i) => colorScale(i))
                .on("mouseover", handleMouseOver)
                .on("mouseout", handleMouseOut);
            
            // Add axes
            g.append("g")
                .attr("class", "axis")
                .attr("transform", \`translate(0,\${innerHeight})\`)
                .call(d3.axisBottom(xScale));
            
            g.append("g")
                .attr("class", "axis")
                .call(d3.axisLeft(yScale));
        }
        
        function createHistogram() {
            const margin = {top: 60, right: 30, bottom: 50, left: 80};
            const innerWidth = width - margin.left - margin.right;
            const innerHeight = height - margin.top - margin.bottom;
            
            const svg = d3.select("#chart")
                .append("svg")
                .attr("width", width)
                .attr("height", height);
                
            const g = svg.append("g")
                .attr("transform", \`translate(\${margin.left},\${margin.top})\`);
            
            // Add title
            svg.append("text")
                .attr("class", "chart-title")
                .attr("x", width / 2)
                .attr("y", 30)
                .text("${title}");
            
            const values = chartData.map(d => d.value);
            
            const xScale = d3.scaleLinear()
                .domain(d3.extent(values))
                .nice()
                .range([0, innerWidth]);
            
            const histogram = d3.histogram()
                .value(d => d)
                .domain(xScale.domain())
                .thresholds(xScale.ticks(20));
            
            const bins = histogram(values);
            
            const yScale = d3.scaleLinear()
                .domain([0, d3.max(bins, d => d.length)])
                .nice()
                .range([innerHeight, 0]);
            
            // Add bars
            g.selectAll(".bar")
                .data(bins)
                .enter().append("rect")
                .attr("class", "bar")
                .attr("x", d => xScale(d.x0))
                .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
                .attr("y", d => yScale(d.length))
                .attr("height", d => innerHeight - yScale(d.length))
                .on("mouseover", function(event, d) {
                    const tooltip = d3.select("#tooltip");
                    tooltip.transition().duration(200).style("opacity", .9);
                    tooltip.html(\`Range: \${d.x0.toFixed(2)} - \${d.x1.toFixed(2)}<br/>Count: \${d.length}\`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", handleMouseOut);
            
            // Add axes
            g.append("g")
                .attr("class", "axis")
                .attr("transform", \`translate(0,\${innerHeight})\`)
                .call(d3.axisBottom(xScale));
            
            g.append("g")
                .attr("class", "axis")
                .call(d3.axisLeft(yScale));
        }
        
        function handleMouseOver(event, d) {
            const tooltip = d3.select("#tooltip");
            tooltip.transition().duration(200).style("opacity", .9);
            
            let tooltipContent = '';
            if (d.data) { // For pie chart
                tooltipContent = \`<strong>\${d.data.label}</strong><br/>Value: \${d.data.value}\`;
            } else {
                tooltipContent = \`<strong>\${d.label}</strong><br/>Value: \${d.value}\`;
                if (d.x !== undefined) tooltipContent += \`<br/>X: \${d.x}\`;
                if (d.y !== undefined) tooltipContent += \`<br/>Y: \${d.y}\`;
            }
            
            tooltip.html(tooltipContent)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        }
        
        function handleMouseOut() {
            d3.select("#tooltip").transition().duration(500).style("opacity", 0);
        }
    </script>
</body>
</html>`;
  }

  private createTimelineVisualization(data: any, title: string, width: number, height: number): string {
    // Simple timeline implementation
    return `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .timeline-item { fill: steelblue; }
        .timeline-item:hover { fill: orange; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div id="timeline"></div>
    <script>
        // This is a placeholder for timeline visualization
        // You can extend this based on your specific data structure
        const data = ${JSON.stringify(data)};
        console.log('Timeline data:', data);
        
        const svg = d3.select("#timeline")
            .append("svg")
            .attr("width", ${width})
            .attr("height", ${height});
            
        svg.append("text")
            .attr("x", ${width/2})
            .attr("y", ${height/2})
            .attr("text-anchor", "middle")
            .text("Timeline visualization - extend based on your data structure");
    </script>
</body>
</html>`;
  }

  private async handleVisualizationComponent(args: any) {
    const { data, type, componentName = 'Neo4jVisualization', width = 800, height = 600 } = args;

    let componentCode = '';
    let processedData = {};

    switch (type) {
      case 'graph':
        if (data.nodes && data.relationships) {
          processedData = this.processGraphData(data.nodes, data.relationships);
          componentCode = this.generateGraphComponent(componentName, processedData, width, height);
        } else {
          throw new Error('Graph visualization requires nodes and relationships data');
        }
        break;
      case 'table':
        if (data.records) {
          processedData = this.processTableData(data.records);
          componentCode = this.generateTableComponent(componentName, processedData);
        } else {
          throw new Error('Table visualization requires records data');
        }
        break;
      default:
        throw new Error(`Component generation for ${type} not yet implemented`);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Generated React component for ${type} visualization:\n\n${componentCode}\n\nProcessed Data:\n${JSON.stringify(processedData, null, 2)}`,
        },
      ],
    };
  }

  private async handleD3VisualizationData(args: any) {
    const { data, type } = args;

    let processedData = {};
    let d3Code = '';

    switch (type) {
      case 'graph':
        if (data.nodes && data.relationships) {
          processedData = this.processGraphData(data.nodes, data.relationships);
          d3Code = this.generateD3GraphCode();
        } else {
          throw new Error('Graph visualization requires nodes and relationships data');
        }
        break;
      case 'table':
        if (data.records) {
          processedData = this.processTableData(data.records);
          d3Code = 'Table visualization uses standard HTML/CSS, no D3 code needed';
        } else {
          throw new Error('Table visualization requires records data');
        }
        break;
      default:
        throw new Error(`D3 data processing for ${type} not yet implemented`);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Processed data for ${type} visualization:\n\nData:\n${JSON.stringify(processedData, null, 2)}\n\nD3 Code:\n${d3Code}`,
        },
      ],
    };
  }

  private processGraphData(nodes: Neo4jNode[], relationships: Neo4jRelationship[]) {
    const d3Nodes = nodes.map(node => ({
      id: node.id,
      label: node.labels.join(', '),
      properties: node.properties,
      group: node.labels[0] || 'default'
    }));

    const d3Links = relationships.map(rel => ({
      source: rel.startNodeId,
      target: rel.endNodeId,
      type: rel.type,
      properties: rel.properties
    }));

    return { nodes: d3Nodes, links: d3Links };
  }

  private processTableData(records: any[]) {
    if (!records || records.length === 0) {
      return { headers: [], rows: [] };
    }

    const allKeys = new Set<string>();
    records.forEach(record => {
      Object.keys(record).forEach(key => allKeys.add(key));
    });
    const headers = Array.from(allKeys);

    const rows = records.map(record => {
      return headers.map(header => {
        const value = record[header];
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }
        return value || '';
      });
    });

    return { headers, rows };
  }

  private generateGraphComponent(componentName: string, data: any, width: number, height: number): string {
    return `
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const ${componentName} = ({ data, width = ${width}, height = ${height} }) => {
  const svgRef = useRef();

  useEffect(() => {
    if (!data || !data.nodes || !data.links) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .selectAll("line")
      .data(data.links)
      .enter().append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2);

    const node = svg.append("g")
      .selectAll("circle")
      .data(data.nodes)
      .enter().append("circle")
      .attr("r", 20)
      .attr("fill", d => color(d.group))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    const nodeLabel = svg.append("g")
      .selectAll("text")
      .data(data.nodes)
      .enter().append("text")
      .attr("font-size", "12px")
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none")
      .text(d => d.properties.name || d.properties.title || d.id);

    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

      nodeLabel
        .attr("x", d => d.x)
        .attr("y", d => d.y + 5);
    });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

  }, [data, width, height]);

  return (
    <div>
      <svg ref={svgRef} width={width} height={height}></svg>
    </div>
  );
};

export default ${componentName};`;
  }

  private generateTableComponent(componentName: string, data: any): string {
    return `
import React from 'react';

const ${componentName} = ({ data }) => {
  if (!data || !data.headers || !data.rows) {
    return <div>No data to display</div>;
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', margin: '20px' }}>
      <div style={{ 
        marginBottom: '20px', 
        padding: '10px', 
        backgroundColor: '#e9ecef', 
        borderRadius: '5px' 
      }}>
        <strong>Total Records:</strong> {data.rows.length} | 
        <strong>Columns:</strong> {data.headers.length}
      </div>
      <table style={{ 
        borderCollapse: 'collapse', 
        width: '100%', 
        marginTop: '20px' 
      }}>
        <thead>
          <tr>
            {data.headers.map((header, index) => (
              <th key={index} style={{ 
                border: '1px solid #ddd', 
                padding: '12px', 
                textAlign: 'left',
                backgroundColor: '#f2f2f2',
                fontWeight: 'bold'
              }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ 
              backgroundColor: rowIndex % 2 === 0 ? '#f9f9f9' : 'white' 
            }}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={{ 
                  border: '1px solid #ddd', 
                  padding: '12px', 
                  textAlign: 'left' 
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ${componentName};`;
  }

  private processChartData(data: any): any[] {
    let chartData: any[] = [];

    // Handle different data structures
    if (data.records && Array.isArray(data.records)) {
      // Process records data
      chartData = this.extractChartDataFromRecords(data.records);
    } else if (data.nodes && Array.isArray(data.nodes)) {
      // Process nodes data - count by labels
      chartData = this.extractChartDataFromNodes(data.nodes);
    } else if (data.relationships && Array.isArray(data.relationships)) {
      // Process relationships data - count by type
      chartData = this.extractChartDataFromRelationships(data.relationships);
    } else if (Array.isArray(data)) {
      // Direct array data
      chartData = this.extractChartDataFromArray(data);
    } else {
      // Try to extract from object properties
      chartData = this.extractChartDataFromObject(data);
    }

    return chartData;
  }

  private extractChartDataFromRecords(records: any[]): any[] {
    if (!records || records.length === 0) return [];

    // Get all numeric fields from records
    const numericFields = this.getNumericFields(records);
    
    if (numericFields.length === 0) {
      // If no numeric fields, create frequency count of first field
      const firstField = Object.keys(records[0])[0];
      if (firstField) {
        return this.createFrequencyData(records, firstField);
      }
      return [];
    }

    // Use first numeric field for simple visualization
    const field = numericFields[0];
    return records.map((record, index) => ({
      label: record.name || record.title || record.id || `Record ${index + 1}`,
      value: record[field] || 0
    })).filter(item => item.value !== null && item.value !== undefined);
  }

  private extractChartDataFromNodes(nodes: Neo4jNode[]): any[] {
    // Count nodes by label
    const labelCounts: Record<string, number> = {};
    
    nodes.forEach(node => {
      const label = node.labels[0] || 'Unknown';
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    });

    return Object.entries(labelCounts).map(([label, count]) => ({
      label,
      value: count
    }));
  }

  private extractChartDataFromRelationships(relationships: Neo4jRelationship[]): any[] {
    // Count relationships by type
    const typeCounts: Record<string, number> = {};
    
    relationships.forEach(rel => {
      const type = rel.type || 'Unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    return Object.entries(typeCounts).map(([type, count]) => ({
      label: type,
      value: count
    }));
  }

  private extractChartDataFromArray(data: any[]): any[] {
    if (data.length === 0) return [];

    // Check if array contains objects with numeric values
    if (typeof data[0] === 'object') {
      const numericFields = this.getNumericFields(data);
      if (numericFields.length > 0) {
        const field = numericFields[0];
        return data.map((item, index) => ({
          label: item.name || item.label || item.title || `Item ${index + 1}`,
          value: item[field] || 0
        }));
      }
    }

    // If array contains primitives, create frequency chart
    if (typeof data[0] === 'string' || typeof data[0] === 'number') {
      const counts: Record<string, number> = {};
      data.forEach(item => {
        const key = String(item);
        counts[key] = (counts[key] || 0) + 1;
      });
      
      return Object.entries(counts).map(([label, count]) => ({
        label,
        value: count
      }));
    }

    return [];
  }

  private extractChartDataFromObject(data: any): any[] {
    if (!data || typeof data !== 'object') return [];

    // Try to find numeric properties
    const entries = Object.entries(data);
    const numericEntries = entries.filter(([key, value]) => 
      typeof value === 'number' && !isNaN(value)
    );

    if (numericEntries.length > 0) {
      return numericEntries.map(([key, value]) => ({
        label: key,
        value: value as number
      }));
    }

    return [];
  }

  private getNumericFields(records: any[]): string[] {
    if (!records || records.length === 0) return [];

    const firstRecord = records[0];
    return Object.keys(firstRecord).filter(key => {
      const value = firstRecord[key];
      return typeof value === 'number' && !isNaN(value);
    });
  }

  private createFrequencyData(records: any[], field: string): any[] {
    const counts: Record<string, number> = {};
    
    records.forEach(record => {
      const value = String(record[field] || 'Unknown');
      counts[value] = (counts[value] || 0) + 1;
    });

    return Object.entries(counts).map(([label, count]) => ({
      label,
      value: count
    }));
  }

  private determineChartType(chartData: any[]): string {
    if (!chartData || chartData.length === 0) return 'bar';

    // Check if data has x,y coordinates for scatter plot
    const hasXY = chartData.some(d => d.x !== undefined && d.y !== undefined);
    if (hasXY) return 'scatter';

    // Check if data represents continuous values for histogram
    const values = chartData.map(d => d.value);
    const isAllNumeric = values.every(v => typeof v === 'number');
    const hasWideRange = isAllNumeric && (Math.max(...values) - Math.min(...values)) > 10;
    
    if (isAllNumeric && hasWideRange && chartData.length > 20) {
      return 'histogram';
    }

    // Check if data is suitable for pie chart (categorical with reasonable number of categories)
    if (chartData.length <= 10 && chartData.every(d => d.value > 0)) {
      return 'pie';
    }

    // Check if data represents time series (has sequential labels that could be dates/times)
    const hasSequentialLabels = chartData.length > 3 && 
      chartData.every((d, i) => i === 0 || d.label > chartData[i-1].label);
    
    if (hasSequentialLabels) {
      return 'line';
    }

    // Default to bar chart
    return 'bar';
  }

  private createEmptyChart(title: string, width: number, height: number, message: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            background-color: #f8f9fa;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 80vh;
        }
        .empty-chart {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 40px;
            text-align: center;
            max-width: 600px;
        }
        .empty-message {
            color: #6c757d;
            font-size: 18px;
            margin-bottom: 20px;
        }
        .empty-icon {
            font-size: 64px;
            color: #dee2e6;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="empty-chart">
        <div class="empty-icon">📊</div>
        <div class="empty-message">${message}</div>
        <p>Please provide data with numeric values or categorical data that can be visualized.</p>
    </div>
</body>
</html>`;
  }

  private generateD3GraphCode(): string {
    return `
// D3.js code for graph visualization
const createGraphVisualization = (container, data, width, height) => {
  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  const simulation = d3.forceSimulation(data.nodes)
    .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = svg.append("g")
    .selectAll("line")
    .data(data.links)
    .enter().append("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", 2);

  const node = svg.append("g")
    .selectAll("circle")
    .data(data.nodes)
    .enter().append("circle")
    .attr("r", 20)
    .attr("fill", d => color(d.group))
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);
  });
};`;
  }

  private async handle3DGraphNetwork(args: any) {
    const { 
      nodes, 
      relationships, 
      title = '3D Neo4j Graph Network',
      enablePhysics = true,
      enableVR = false,
      nodeSize = 1,
      linkDistance = 30
    } = args;

    const componentCode = this.generate3DGraphComponent(nodes, relationships, {
      title,
      enablePhysics,
      enableVR,
      nodeSize,
      linkDistance
    });

    return {
      content: [
        {
          type: 'text',
          text: `Generated 3D Graph Network visualization with ${nodes.length} nodes and ${relationships.length} relationships.\n\nReact Component Code:\n\n${componentCode}`,
        },
      ],
    };
  }

  private async handlePathVisualization(args: any) {
    const { 
      nodes, 
      relationships, 
      paths,
      title = 'Neo4j Path Visualization',
      animationSpeed = 1000,
      showSteps = true
    } = args;

    const componentCode = this.generatePathVisualizationComponent(nodes, relationships, paths, {
      title,
      animationSpeed,
      showSteps
    });

    return {
      content: [
        {
          type: 'text',
          text: `Generated Path Visualization with ${paths.length} paths across ${nodes.length} nodes.\n\nReact Component Code:\n\n${componentCode}`,
        },
      ],
    };
  }

  private async handleSankeyDiagram(args: any) {
    const { 
      flows, 
      nodes, 
      title = 'Neo4j Sankey Flow Diagram',
      width = 800,
      height = 600,
      nodeWidth = 15,
      nodePadding = 10
    } = args;

    const componentCode = this.generateSankeyComponent(flows, nodes, {
      title,
      width,
      height,
      nodeWidth,
      nodePadding
    });

    return {
      content: [
        {
          type: 'text',
          text: `Generated Sankey Diagram with ${flows.length} flows between ${nodes.length} nodes.\n\nReact Component Code:\n\n${componentCode}`,
        },
      ],
    };
  }

  private async handleHierarchicalTree(args: any) {
    const { 
      treeData, 
      visualizationType,
      title = 'Neo4j Hierarchical Visualization',
      width = 800,
      height = 600,
      interactive = true,
      showLabels = true
    } = args;

    const componentCode = this.generateHierarchicalTreeComponent(treeData, {
      visualizationType,
      title,
      width,
      height,
      interactive,
      showLabels
    });

    return {
      content: [
        {
          type: 'text',
          text: `Generated ${visualizationType} hierarchical visualization.\n\nReact Component Code:\n\n${componentCode}`,
        },
      ],
    };
  }

  private generate3DGraphComponent(nodes: any[], relationships: any[], options: any): string {
    return `
import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

const Node3D = ({ position, color, size, label, onClick }) => {
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <Text
        position={[0, size + 0.5, 0]}
        fontSize={0.5}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
};

const Link3D = ({ start, end, color = '#999999' }) => {
  const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} />
    </line>
  );
};

const Graph3D = ({ nodes, relationships, options }) => {
  const processedNodes = nodes.map((node, index) => ({
    ...node,
    position: [
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20
    ],
    color: \`hsl(\${(index * 137.508) % 360}, 70%, 50%)\`,
    size: options.nodeSize || 1
  }));

  const processedLinks = relationships.map(rel => {
    const sourceNode = processedNodes.find(n => n.id === rel.startNodeId);
    const targetNode = processedNodes.find(n => n.id === rel.endNodeId);
    return {
      ...rel,
      start: sourceNode?.position || [0, 0, 0],
      end: targetNode?.position || [0, 0, 0]
    };
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      
      {processedNodes.map((node) => (
        <Node3D
          key={node.id}
          position={node.position}
          color={node.color}
          size={node.size}
          label={node.properties.name || node.id}
          onClick={() => console.log('Node clicked:', node)}
        />
      ))}
      
      {processedLinks.map((link, index) => (
        <Link3D
          key={index}
          start={link.start}
          end={link.end}
          color="#666666"
        />
      ))}
      
      <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
    </>
  );
};

const ${options.title.replace(/\s+/g, '')}3D = ({ data = { nodes: [], relationships: [] } }) => {
  return (
    <div style={{ width: '100%', height: '600px', background: '#000' }}>
      <h2 style={{ color: 'white', textAlign: 'center', margin: '10px 0' }}>
        ${options.title}
      </h2>
      <Canvas camera={{ position: [0, 0, 30], fov: 75 }}>
        <Graph3D 
          nodes={data.nodes || []} 
          relationships={data.relationships || []}
          options={${JSON.stringify(options)}}
        />
      </Canvas>
      <div style={{ color: 'white', textAlign: 'center', padding: '10px' }}>
        <p>Use mouse to rotate, zoom, and pan the 3D graph</p>
        <p>Nodes: {data.nodes?.length || 0} | Relationships: {data.relationships?.length || 0}</p>
      </div>
    </div>
  );
};

export default ${options.title.replace(/\s+/g, '')}3D;

// Required dependencies:
// npm install three @react-three/fiber @react-three/drei
`;
  }

  private generatePathVisualizationComponent(nodes: any[], relationships: any[], paths: any[], options: any): string {
    return `
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const PathVisualization = ({ data, options }) => {
  const svgRef = useRef();
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!data.nodes || !data.relationships || !data.paths) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const height = 600;
    const margin = { top: 50, right: 50, bottom: 50, left: 50 };

    // Create main group
    const g = svg.append("g")
      .attr("transform", \`translate(\${margin.left},\${margin.top})\`);

    // Set up scales and simulation
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    
    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.relationships).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter((width - margin.left - margin.right) / 2, (height - margin.top - margin.bottom) / 2));

    // Create links
    const links = g.append("g")
      .selectAll("line")
      .data(data.relationships)
      .enter().append("line")
      .attr("class", "link")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2);

    // Create nodes
    const nodes = g.append("g")
      .selectAll("circle")
      .data(data.nodes)
      .enter().append("circle")
      .attr("class", "node")
      .attr("r", 15)
      .attr("fill", d => color(d.labels[0]))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Add node labels
    const nodeLabels = g.append("g")
      .selectAll("text")
      .data(data.nodes)
      .enter().append("text")
      .attr("class", "node-label")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("font-size", "10px")
      .attr("fill", "white")
      .text(d => d.properties.name || d.id);

    // Path highlighting
    const pathGroup = g.append("g").attr("class", "paths");

    data.paths.forEach((path, pathIndex) => {
      // Create path links
      path.relationshipIds.forEach((relId, index) => {
        const relationship = data.relationships.find(r => r.id === relId);
        if (relationship) {
          pathGroup.append("line")
            .attr("class", \`path-link path-\${pathIndex}\`)
            .attr("stroke", path.color || "#ff6b35")
            .attr("stroke-width", (path.weight || 1) * 4)
            .attr("stroke-opacity", 0)
            .attr("data-step", index);
        }
      });

      // Create path nodes
      path.nodeIds.forEach((nodeId, index) => {
        const node = data.nodes.find(n => n.id === nodeId);
        if (node) {
          pathGroup.append("circle")
            .attr("class", \`path-node path-\${pathIndex}\`)
            .attr("r", 20)
            .attr("fill", path.color || "#ff6b35")
            .attr("stroke", "#fff")
            .attr("stroke-width", 3)
            .attr("opacity", 0)
            .attr("data-step", index);
        }
      });
    });

    // Animation function
    const animatePath = (pathIndex) => {
      const path = data.paths[pathIndex];
      if (!path) return;

      setIsAnimating(true);
      let step = 0;

      const animate = () => {
        // Highlight current step
        pathGroup.selectAll(\`.path-\${pathIndex}[data-step="\${step}"]\`)
          .transition()
          .duration(options.animationSpeed / 2)
          .attr("opacity", 1)
          .attr("stroke-opacity", 0.8);

        step++;
        setCurrentStep(step);

        if (step < Math.max(path.nodeIds.length, path.relationshipIds.length)) {
          setTimeout(animate, options.animationSpeed);
        } else {
          setIsAnimating(false);
        }
      };

      animate();
    };

    // Update positions on simulation tick
    simulation.on("tick", () => {
      links
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      nodes
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

      nodeLabels
        .attr("x", d => d.x)
        .attr("y", d => d.y);

      // Update path elements
      data.paths.forEach((path, pathIndex) => {
        path.relationshipIds.forEach((relId, index) => {
          const relationship = data.relationships.find(r => r.id === relId);
          if (relationship) {
            pathGroup.select(\`.path-link.path-\${pathIndex}[data-step="\${index}"]\`)
              .attr("x1", relationship.source.x)
              .attr("y1", relationship.source.y)
              .attr("x2", relationship.target.x)
              .attr("y2", relationship.target.y);
          }
        });

        path.nodeIds.forEach((nodeId, index) => {
          const node = data.nodes.find(n => n.id === nodeId);
          if (node) {
            pathGroup.select(\`.path-node.path-\${pathIndex}[data-step="\${index}"]\`)
              .attr("cx", node.x)
              .attr("cy", node.y);
          }
        });
      });
    });

    // Auto-start animation for first path
    if (data.paths.length > 0) {
      setTimeout(() => animatePath(0), 1000);
    }

  }, [data, options]);

  const resetAnimation = () => {
    setCurrentStep(0);
    setIsAnimating(false);
    const svg = d3.select(svgRef.current);
    svg.selectAll(".path-link, .path-node")
      .transition()
      .duration(200)
      .attr("opacity", 0)
      .attr("stroke-opacity", 0);
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ textAlign: 'center', margin: '20px 0' }}>${options.title}</h2>
      
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button 
          onClick={resetAnimation}
          disabled={isAnimating}
          style={{
            padding: '10px 20px',
            backgroundColor: isAnimating ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isAnimating ? 'not-allowed' : 'pointer'
          }}
        >
          {isAnimating ? \`Animating... Step \${currentStep}\` : 'Reset Animation'}
        </button>
      </div>

      <svg 
        ref={svgRef} 
        width={800} 
        height={600}
        style={{ border: '1px solid #ddd', borderRadius: '5px' }}
      />

      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
        <h3>Path Information:</h3>
        {data.paths?.map((path, index) => (
          <div key={path.id} style={{ marginBottom: '10px' }}>
            <strong style={{ color: path.color || '#ff6b35' }}>Path {index + 1}:</strong>
            <span style={{ marginLeft: '10px' }}>
              {path.nodeIds.length} nodes, {path.relationshipIds.length} relationships
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PathVisualization;
`;
  }

  private generateSankeyComponent(flows: any[], nodes: any[], options: any): string {
    return `
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const SankeyDiagram = ({ flows, nodes, options }) => {
  const svgRef = useRef();

  useEffect(() => {
    if (!flows || !nodes) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height, nodeWidth, nodePadding } = options;
    const margin = { top: 50, right: 50, bottom: 50, left: 50 };

    // Create Sankey generator
    const sankey = d3.sankey()
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]]);

    // Prepare data
    const sankeyData = {
      nodes: nodes.map(d => ({ ...d })),
      links: flows.map(d => ({
        source: d.source,
        target: d.target,
        value: d.value,
        label: d.label
      }))
    };

    // Generate Sankey layout
    const { nodes: sankeyNodes, links: sankeyLinks } = sankey(sankeyData);

    // Color scale
    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // Create main group
    const g = svg.append("g");

    // Add title
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .attr("font-size", "18px")
      .attr("font-weight", "bold")
      .text(options.title);

    // Draw links
    const link = g.append("g")
      .selectAll("path")
      .data(sankeyLinks)
      .enter().append("path")
      .attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke", d => color(d.source.category || d.source.name))
      .attr("stroke-width", d => Math.max(1, d.width))
      .attr("fill", "none")
      .attr("opacity", 0.5)
      .on("mouseover", function(event, d) {
        d3.select(this).attr("opacity", 0.8);
        
        // Show tooltip
        const tooltip = d3.select("body").append("div")
          .attr("class", "sankey-tooltip")
          .style("position", "absolute")
          .style("background", "rgba(0,0,0,0.8)")
          .style("color", "white")
          .style("padding", "10px")
          .style("border-radius", "5px")
          .style("pointer-events", "none")
          .style("opacity", 0);

        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(\`
          <strong>\${d.source.name} → \${d.target.name}</strong><br/>
          Value: \${d.value}<br/>
          \${d.label ? \`Label: \${d.label}\` : ''}
        \`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function(event, d) {
        d3.select(this).attr("opacity", 0.5);
        d3.selectAll(".sankey-tooltip").remove();
      });

    // Draw nodes
    const node = g.append("g")
      .selectAll("rect")
      .data(sankeyNodes)
      .enter().append("rect")
      .attr("x", d => d.x0)
      .attr("y", d => d.y0)
      .attr("height", d => d.y1 - d.y0)
      .attr("width", d => d.x1 - d.x0)
      .attr("fill", d => color(d.category || d.name))
      .attr("stroke", "#000")
      .attr("stroke-width", 1)
      .on("mouseover", function(event, d) {
        d3.select(this).attr("opacity", 0.8);
        
        // Highlight connected links
        link.attr("opacity", l => 
          l.source === d || l.target === d ? 0.8 : 0.2
        );
      })
      .on("mouseout", function(event, d) {
        d3.select(this).attr("opacity", 1);
        link.attr("opacity", 0.5);
      });

    // Add node labels
    g.append("g")
      .selectAll("text")
      .data(sankeyNodes)
      .enter().append("text")
      .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
      .attr("y", d => (d.y1 + d.y0) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
      .attr("font-size", "12px")
      .text(d => d.name);

    // Add value labels on nodes
    g.append("g")
      .selectAll("text")
      .data(sankeyNodes)
      .enter().append("text")
      .attr("x", d => (d.x0 + d.x1) / 2)
      .attr("y", d => (d.y1 + d.y0) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "white")
      .text(d => d.value);

  }, [flows, nodes, options]);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <svg 
        ref={svgRef} 
        width={options.width} 
        height={options.height}
        style={{ border: '1px solid #ddd', borderRadius: '5px' }}
      />
      
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
        <h3>Flow Summary:</h3>
        <p><strong>Total Flows:</strong> {flows.length}</p>
        <p><strong>Total Nodes:</strong> {nodes.length}</p>
        <p><strong>Total Value:</strong> {flows.reduce((sum, flow) => sum + flow.value, 0)}</p>
      </div>
    </div>
  );
};

export default SankeyDiagram;

// Note: This component requires d3-sankey
// Install with: npm install d3-sankey
`;
  }

  private generateHierarchicalTreeComponent(treeData: any, options: any): string {
    return `
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const HierarchicalTree = ({ treeData, options }) => {
  const svgRef = useRef();
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    if (!treeData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height, visualizationType, interactive, showLabels } = options;
    const margin = { top: 50, right: 50, bottom: 50, left: 50 };

    // Create main group
    const g = svg.append("g")
      .attr("transform", \`translate(\${margin.left},\${margin.top})\`);

    // Add title
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .attr("font-size", "18px")
      .attr("font-weight", "bold")
      .text(options.title);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create hierarchy
    const root = d3.hierarchy(treeData);
    
    if (visualizationType === 'tree') {
      // Tree layout
      const treeLayout = d3.tree().size([innerHeight, innerWidth]);
      treeLayout(root);

      // Draw links
      g.selectAll(".link")
        .data(root.links())
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkHorizontal()
          .x(d => d.y)
          .y(d => d.x))
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);

      // Draw nodes
      const node = g.selectAll(".node")
        .data(root.descendants())
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", d => \`translate(\${d.y},\${d.x})\`)
        .style("cursor", interactive ? "pointer" : "default");

      node.append("circle")
        .attr("r", 8)
        .attr("fill", d => d.children ? "#555" : "#999")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);

      if (showLabels) {
        node.append("text")
          .attr("dy", ".35em")
          .attr("x", d => d.children ? -13 : 13)
          .style("text-anchor", d => d.children ? "end" : "start")
          .attr("font-size", "12px")
          .text(d => d.data.name);
      }

      if (interactive) {
        node.on("click", function(event, d) {
          setSelectedNode(d.data);
        });
      }

    } else if (visualizationType === 'radial') {
      // Radial tree layout
      const radius = Math.min(innerWidth, innerHeight) / 2;
      const tree = d3.tree()
        .size([2 * Math.PI, radius])
        .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);

      tree(root);

      // Transform to center
      g.attr("transform", \`translate(\${width/2},\${height/2})\`);

      // Draw links
      g.selectAll(".link")
        .data(root.links())
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkRadial()
          .angle(d => d.x)
          .radius(d => d.y))
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);

      // Draw nodes
      const node = g.selectAll(".node")
        .data(root.descendants())
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", d => \`translate(\${d.y * Math.cos(d.x - Math.PI / 2)},\${d.y * Math.sin(d.x - Math.PI / 2)})\`)
        .style("cursor", interactive ? "pointer" : "default");

      node.append("circle")
        .attr("r", 6)
        .attr("fill", d => d.children ? "#555" : "#999")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);

      if (showLabels) {
        node.append("text")
          .attr("dy", ".35em")
          .attr("x", d => d.x < Math.PI === !d.children ? 6 : -6)
          .style("text-anchor", d => d.x < Math.PI === !d.children ? "start" : "end")
          .attr("transform", d => d.x >= Math.PI ? "rotate(180)" : null)
          .attr("font-size", "10px")
          .text(d => d.data.name);
      }

    } else if (visualizationType === 'sunburst') {
      // Sunburst layout
      const radius = Math.min(innerWidth, innerHeight) / 2;
      const partition = d3.partition().size([2 * Math.PI, radius]);
      
      root.sum(d => d.value || 1);
      partition(root);

      g.attr("transform", \`translate(\${width/2},\${height/2})\`);

      const color = d3.scaleOrdinal(d3.schemeCategory10);
      const arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .innerRadius(d => d.y0)
        .outerRadius(d => d.y1);

      g.selectAll("path")
        .data(root.descendants())
        .enter().append("path")
        .attr("d", arc)
        .attr("fill", d => color(d.data.name))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .style("cursor", interactive ? "pointer" : "default")
        .on("click", interactive ? function(event, d) {
          setSelectedNode(d.data);
        } : null);

    } else if (visualizationType === 'treemap') {
      // Treemap layout
      const treemap = d3.treemap().size([innerWidth, innerHeight]).padding(1);
      
      root.sum(d => d.value || 1);
      treemap(root);

      const color = d3.scaleOrdinal(d3.schemeCategory10);

      g.selectAll("rect")
        .data(root.leaves())
        .enter().append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("height", d => d.y1 - d.y0)
        .attr("fill", d => color(d.parent.data.name))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .style("cursor", interactive ? "pointer" : "default")
        .on("click", interactive ? function(event, d) {
          setSelectedNode(d.data);
        } : null);

      if (showLabels) {
        g.selectAll("text")
          .data(root.leaves())
          .enter().append("text")
          .attr("x", d => (d.x0 + d.x1) / 2)
          .attr("y", d => (d.y0 + d.y1) / 2)
          .attr("text-anchor", "middle")
          .attr("font-size", "10px")
          .text(d => d.data.name);
      }
    }

  }, [treeData, options]);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <svg 
        ref={svgRef} 
        width={options.width} 
        height={options.height}
        style={{ border: '1px solid #ddd', borderRadius: '5px' }}
      />
      
      {selectedNode && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <h3>Selected Node:</h3>
          <p><strong>Name:</strong> {selectedNode.name}</p>
          {selectedNode.value && <p><strong>Value:</strong> {selectedNode.value}</p>}
          {selectedNode.properties && (
            <div>
              <strong>Properties:</strong>
              <pre>{JSON.stringify(selectedNode.properties, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
      
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e9ecef', borderRadius: '5px' }}>
        <h3>Visualization Info:</h3>
        <p><strong>Type:</strong> {options.visualizationType}</p>
        <p><strong>Interactive:</strong> {options.interactive ? 'Yes' : 'No'}</p>
        <p><strong>Show Labels:</strong> {options.showLabels ? 'Yes' : 'No'}</p>
      </div>
    </div>
  );
};

export default HierarchicalTree;
`;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Neo4j Visualizer MCP server running on stdio');
  }
}

const server = new Neo4jVisualizerServer();
server.run().catch(console.error);
