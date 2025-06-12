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
                        labels: { type: 'array', items: { type: 'string' } },
                        properties: { type: 'object' }
                      }
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
                        properties: { type: 'object' }
                      }
                    }
                  },
                  records: {
                    type: 'array',
                    description: 'Array of query result records'
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
                    labels: { type: 'array', items: { type: 'string' } },
                    properties: { type: 'object' }
                  }
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
                    properties: { type: 'object' }
                  }
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
                description: 'Array of query result records'
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
                description: 'Neo4j query results containing nodes, relationships, or records'
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
                description: 'Neo4j query results containing nodes, relationships, or records'
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
    // Simple bar chart implementation
    return `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .bar { fill: steelblue; }
        .bar:hover { fill: orange; }
        .axis { font-size: 12px; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div id="chart"></div>
    <script>
        // This is a placeholder for chart visualization
        // You can extend this based on your specific data structure
        const data = ${JSON.stringify(data)};
        console.log('Chart data:', data);
        
        const svg = d3.select("#chart")
            .append("svg")
            .attr("width", ${width})
            .attr("height", ${height});
            
        svg.append("text")
            .attr("x", ${width/2})
            .attr("y", ${height/2})
            .attr("text-anchor", "middle")
            .text("Chart visualization - extend based on your data structure");
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
