import fs from 'fs';
import { BaseVisualization } from './base.js';
import { Neo4jNode, Neo4jRelationship, VisualizationOptions } from '../types.js';

export class GraphVisualization extends BaseVisualization {
  async generate(args: { nodes: Neo4jNode[]; relationships: Neo4jRelationship[]; title?: string; width?: number; height?: number; outputPath?: string }): Promise<{ content: Array<{ type: string; text: string }> }> {
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
}
