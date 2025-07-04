#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Neo4jNode, Neo4jRelationship, Neo4jQueryResult, VisualizationOptions, LineageConfig } from './types.js';
import { GraphVisualization } from './visualizations/graph.js';
import { TableVisualization } from './visualizations/table.js';
import { ChartVisualization } from './visualizations/chart.js';
import { ReactFlowVisualization } from './visualizations/reactflow.js';

class Neo4jVisualizerServer {
  private server: Server;
  private graphViz: GraphVisualization;
  private tableViz: TableVisualization;
  private chartViz: ChartVisualization;
  private reactFlowViz: ReactFlowVisualization;

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

    // Initialize visualization classes
    this.graphViz = new GraphVisualization();
    this.tableViz = new TableVisualization();
    this.chartViz = new ChartVisualization();
    this.reactFlowViz = new ReactFlowVisualization();

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
          name: 'create_reactflow_lineage',
          description: 'Create interactive ReactFlow-based lineage visualizations for Neo4j data with hierarchical grouping and advanced interactions',
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
              lineageConfig: {
                type: 'object',
                description: 'Configuration for lineage visualization',
                properties: {
                  direction: {
                    type: 'string',
                    enum: ['LR', 'TB', 'RL', 'BT'],
                    default: 'LR',
                    description: 'Layout direction (Left-Right, Top-Bottom, Right-Left, Bottom-Top)'
                  },
                  groupByProperty: {
                    type: 'string',
                    description: 'Property name to group nodes by (creates parent-child relationships)'
                  },
                  showHierarchy: {
                    type: 'boolean',
                    default: true,
                    description: 'Enable hierarchical parent-child grouping'
                  },
                  enableFiltering: {
                    type: 'boolean',
                    default: true,
                    description: 'Enable node/edge type filtering'
                  },
                  enableExpansion: {
                    type: 'boolean',
                    default: true,
                    description: 'Enable expand/collapse functionality'
                  },
                  nodeSpacing: {
                    type: 'number',
                    default: 100,
                    description: 'Spacing between nodes'
                  },
                  rankSpacing: {
                    type: 'number',
                    default: 150,
                    description: 'Spacing between ranks/levels'
                  }
                },
                additionalProperties: false
              },
              title: { type: 'string', default: 'Neo4j ReactFlow Lineage' },
              width: { type: 'number', default: 1200 },
              height: { type: 'number', default: 800 },
              outputPath: { type: 'string', description: 'Optional file path to save the visualization' }
            },
            required: ['nodes', 'relationships']
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
          case 'create_reactflow_lineage':
            return await this.handleReactFlowLineage(request.params.arguments);
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
    const { data, type, title = 'Neo4j Query Results', width = 800, height = 600, outputPath } = args;

    switch (type) {
      case 'graph':
        if (data.nodes && data.relationships) {
          return await this.graphViz.generate({ nodes: data.nodes, relationships: data.relationships, title, width, height, outputPath });
        } else {
          throw new Error('Graph visualization requires nodes and relationships data');
        }
      case 'table':
        if (data.records) {
          return await this.tableViz.generate({ records: data.records, title, outputPath });
        } else {
          throw new Error('Table visualization requires records data');
        }
      case 'chart':
        return await this.chartViz.generate({ data, title, width, height });
      case 'timeline':
        // Timeline visualization would be implemented here
        throw new Error('Timeline visualization not yet implemented');
      default:
        throw new Error(`Unknown visualization type: ${type}`);
    }
  }

  private async handleGraphNetwork(args: any) {
    return await this.graphViz.generate(args);
  }

  private async handleDataTable(args: any) {
    return await this.tableViz.generate(args);
  }

  private async handleVisualizationComponent(args: any) {
    const { data, type, componentName = 'Neo4jVisualization', width = 800, height = 600 } = args;

    // This would generate React component code
    // For now, return a placeholder
    return {
      content: [
        {
          type: 'text',
          text: `React component generation for ${type} visualization is not yet fully implemented in the modular structure. Please use the direct visualization tools instead.`,
        },
      ],
    };
  }

  private async handleD3VisualizationData(args: any) {
    const { data, type } = args;

    // This would generate D3.js code and processed data
    // For now, return a placeholder
    return {
      content: [
        {
          type: 'text',
          text: `D3.js data processing for ${type} visualization is not yet fully implemented in the modular structure. Please use the direct visualization tools instead.`,
        },
      ],
    };
  }

  private async handleReactFlowLineage(args: any) {
    return await this.reactFlowViz.generate(args);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Neo4j Visualizer MCP server running on stdio');
  }
}

const server = new Neo4jVisualizerServer();
server.run().catch(console.error);
