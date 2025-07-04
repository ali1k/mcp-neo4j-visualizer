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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Neo4j Visualizer MCP server running on stdio');
  }
}

const server = new Neo4jVisualizerServer();
server.run().catch(console.error);
