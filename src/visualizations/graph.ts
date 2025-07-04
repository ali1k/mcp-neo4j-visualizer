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
    // Transform Neo4j data for visualization
    const graphNodes = nodes.map(node => ({
      id: node.id,
      label: node.labels.join(', '),
      properties: node.properties,
      group: node.labels[0] || 'default',
      displayName: node.properties.name || node.properties.title || node.id
    }));

    const graphLinks = relationships.map(rel => ({
      source: rel.startNodeId,
      target: rel.endNodeId,
      type: rel.type,
      properties: rel.properties
    }));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
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
        .graph-container {
            width: 100%;
            height: 100%;
            position: relative;
            background: white;
            border-radius: 8px;
            margin: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
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
        // Self-contained graph visualization without external dependencies
        const nodes = ${JSON.stringify(graphNodes)};
        const links = ${JSON.stringify(graphLinks)};
        
        function createFallbackVisualization() {
            const container = document.getElementById('root');
            
            // Create header
            const header = document.createElement('div');
            header.className = 'iframe-header';
            header.innerHTML = \`
                <h1>${title}</h1>
                <p>🎯 Drag nodes to move them • 👆 Click nodes for details • \${nodes.length} nodes • \${links.length} edges</p>
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
            
            // Calculate layout positions for nodes using force simulation
            const nodePositions = calculateForceLayout(nodes, links);
            
            // Create SVG for the graph
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.width = '100%';
            svg.style.height = '400px';
            svg.style.border = '1px solid #e0e0e0';
            svg.style.borderRadius = '8px';
            svg.style.background = '#fafafa';
            
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
            
            // Color scheme for different node groups
            const colors = ['#00B5AD', '#FF6B35', '#F7931E', '#FFD23F', '#EE5A24', '#5F27CD', '#00D2D3', '#FF9FF3', '#54A0FF', '#5F27CD'];
            const groupColors = {};
            const groups = [...new Set(nodes.map(n => n.group))];
            groups.forEach((group, i) => {
                groupColors[group] = colors[i % colors.length];
            });
            
            // Add edges first (so they appear behind nodes)
            links.forEach(link => {
                const sourcePos = nodePositions[link.source];
                const targetPos = nodePositions[link.target];
                
                if (sourcePos && targetPos) {
                    // Create edge line
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', sourcePos.x);
                    line.setAttribute('y1', sourcePos.y);
                    line.setAttribute('x2', targetPos.x);
                    line.setAttribute('y2', targetPos.y);
                    line.setAttribute('stroke', '#999');
                    line.setAttribute('stroke-width', 2);
                    line.setAttribute('marker-end', 'url(#arrowhead)');
                    line.setAttribute('data-link-id', link.source + '-' + link.target);
                    svg.appendChild(line);
                    
                    // Add edge label
                    const midX = (sourcePos.x + targetPos.x) / 2;
                    const midY = (sourcePos.y + targetPos.y) / 2;
                    
                    const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    labelGroup.setAttribute('data-link-label', link.source + '-' + link.target);
                    
                    const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    labelBg.setAttribute('x', midX - 25);
                    labelBg.setAttribute('y', midY - 8);
                    labelBg.setAttribute('width', 50);
                    labelBg.setAttribute('height', 16);
                    labelBg.setAttribute('fill', 'white');
                    labelBg.setAttribute('stroke', '#ddd');
                    labelBg.setAttribute('rx', 3);
                    
                    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label.setAttribute('x', midX);
                    label.setAttribute('y', midY + 3);
                    label.setAttribute('text-anchor', 'middle');
                    label.setAttribute('font-size', '9');
                    label.setAttribute('font-weight', 'bold');
                    label.setAttribute('fill', '#666');
                    label.textContent = link.type;
                    
                    labelGroup.appendChild(labelBg);
                    labelGroup.appendChild(label);
                    svg.appendChild(labelGroup);
                }
            });
            
            // Add interactive nodes with drag functionality
            let selectedNode = null;
            let isDragging = false;
            let dragOffset = { x: 0, y: 0 };
            
            nodes.forEach(node => {
                const pos = nodePositions[node.id];
                if (pos) {
                    // Create node group
                    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    nodeGroup.setAttribute('data-node-id', node.id);
                    nodeGroup.style.cursor = 'grab';
                    
                    // Node circle
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('cx', pos.x);
                    circle.setAttribute('cy', pos.y);
                    circle.setAttribute('r', 20);
                    circle.setAttribute('fill', groupColors[node.group]);
                    circle.setAttribute('stroke', 'white');
                    circle.setAttribute('stroke-width', 3);
                    circle.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
                    
                    // Node label
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', pos.x);
                    text.setAttribute('y', pos.y + 4);
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('font-size', '11');
                    text.setAttribute('font-weight', 'bold');
                    text.setAttribute('fill', 'white');
                    text.textContent = node.displayName.length > 10 ? 
                        node.displayName.substring(0, 10) + '...' : node.displayName;
                    text.style.pointerEvents = 'none';
                    
                    nodeGroup.appendChild(circle);
                    nodeGroup.appendChild(text);
                    
                    // Add hover effects
                    nodeGroup.addEventListener('mouseenter', () => {
                        if (!isDragging) {
                            circle.setAttribute('r', 25);
                            circle.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))';
                        }
                    });
                    nodeGroup.addEventListener('mouseleave', () => {
                        if (!isDragging) {
                            circle.setAttribute('r', 20);
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
                    selectedNode.circle.setAttribute('r', 20);
                    selectedNode.circle.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
                }
                isDragging = false;
                selectedNode = null;
            });
            
            // Function to update edge positions when nodes are dragged
            function updateEdgePositions() {
                const lines = svg.querySelectorAll('line[data-link-id]');
                const labels = svg.querySelectorAll('g[data-link-label]');
                
                lines.forEach(line => {
                    const linkId = line.getAttribute('data-link-id');
                    const [sourceId, targetId] = linkId.split('-');
                    const sourcePos = nodePositions[sourceId];
                    const targetPos = nodePositions[targetId];
                    if (sourcePos && targetPos) {
                        line.setAttribute('x1', sourcePos.x);
                        line.setAttribute('y1', sourcePos.y);
                        line.setAttribute('x2', targetPos.x);
                        line.setAttribute('y2', targetPos.y);
                    }
                });
                
                labels.forEach(labelGroup => {
                    const linkId = labelGroup.getAttribute('data-link-label');
                    const [sourceId, targetId] = linkId.split('-');
                    const sourcePos = nodePositions[sourceId];
                    const targetPos = nodePositions[targetId];
                    if (sourcePos && targetPos) {
                        const midX = (sourcePos.x + targetPos.x) / 2;
                        const midY = (sourcePos.y + targetPos.y) / 2;
                        
                        const rect = labelGroup.querySelector('rect');
                        const text = labelGroup.querySelector('text');
                        if (rect && text) {
                            rect.setAttribute('x', midX - 25);
                            rect.setAttribute('y', midY - 8);
                            text.setAttribute('x', midX);
                            text.setAttribute('y', midY + 3);
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
                    border: 2px solid \${groupColors[node.group]};
                    border-radius: 8px;
                    padding: 15px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    z-index: 10000;
                    max-width: 300px;
                    font-family: inherit;
                \`;
                
                popup.innerHTML = \`
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="margin: 0; color: #333; font-size: 16px;">\${node.displayName}</h3>
                        <button onclick="this.parentElement.parentElement.remove()" style="
                            background: none; border: none; font-size: 18px; 
                            cursor: pointer; color: #666; padding: 0; margin-left: 10px;
                        ">×</button>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 10px;">
                        <span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px;">\${node.label}</span>
                    </div>
                    <div style="font-size: 13px; color: #333;">
                        <strong>Properties:</strong>
                        <div style="margin-top: 8px; background: #f8f9fa; padding: 10px; border-radius: 4px;">
                            \${Object.entries(node.properties).map(([key, value]) => 
                                \`<div style="margin: 4px 0;"><strong>\${key}:</strong> \${value}</div>\`
                            ).join('')}
                        </div>
                    </div>
                    <div style="margin-top: 10px; font-size: 11px; color: #888;">
                        💡 Click and drag the node to move it around!
                    </div>
                \`;
                
                // Position popup near the click
                const rect = svg.getBoundingClientRect();
                popup.style.left = (event.clientX + 10) + 'px';
                popup.style.top = (event.clientY - 50) + 'px';
                
                document.body.appendChild(popup);
                
                // Auto-remove after 8 seconds
                setTimeout(() => {
                    if (popup.parentElement) {
                        popup.remove();
                    }
                }, 8000);
            }
            
            graphContainer.appendChild(svg);
            
            // Add legend
            const legendSection = document.createElement('div');
            legendSection.style.marginTop = '20px';
            legendSection.style.padding = '15px';
            legendSection.style.background = '#f8f9fa';
            legendSection.style.borderRadius = '8px';
            legendSection.style.border = '1px solid #e9ecef';
            
            legendSection.innerHTML = \`
                <h4 style="margin-top: 0; color: #333;">🏷️ Node Types</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 15px;">
                    \${groups.map(group => 
                        \`<div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 16px; height: 16px; border-radius: 50%; background: \${groupColors[group]};"></div>
                            <span style="font-size: 14px;">\${group}</span>
                        </div>\`
                    ).join('')}
                </div>
            \`;
            
            graphContainer.appendChild(legendSection);
            
            // Add statistics
            const statsSection = document.createElement('div');
            statsSection.style.marginTop = '20px';
            statsSection.style.padding = '15px';
            statsSection.style.background = '#e3f2fd';
            statsSection.style.borderRadius = '8px';
            
            statsSection.innerHTML = \`
                <h4 style="margin-top: 0; color: #1976d2;">📊 Graph Statistics</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div>
                        <strong>Nodes:</strong> \${nodes.length}<br>
                        <strong>Node Types:</strong> \${groups.length}
                    </div>
                    <div>
                        <strong>Relationships:</strong> \${links.length}<br>
                        <strong>Relationship Types:</strong> \${[...new Set(links.map(l => l.type))].length}
                    </div>
                </div>
            \`;
            
            graphContainer.appendChild(statsSection);
            content.appendChild(graphContainer);
            
            // Add success note
            const note = document.createElement('div');
            note.style.cssText = \`
                margin-top: 20px; padding: 15px; 
                background: #d4edda; border: 1px solid #c3e6cb;
                border-radius: 8px; font-size: 14px; color: #155724;
            \`;
            note.innerHTML = \`
                <strong>✅ Interactive Graph Network!</strong> 
                This visualization supports drag-and-drop node movement, click-to-view details, 
                and real-time edge updates. Perfect for iframe embedding with zero external dependencies.
            \`;
            content.appendChild(note);
            
            // Clear container and add new content
            container.innerHTML = '';
            container.appendChild(header);
            container.appendChild(content);
        }
        
        function calculateForceLayout(nodes, links) {
            const positions = {};
            const svgWidth = 600;
            const svgHeight = 350;
            const margin = 40;
            
            // Initialize positions randomly
            nodes.forEach(node => {
                positions[node.id] = {
                    x: margin + Math.random() * (svgWidth - 2 * margin),
                    y: margin + Math.random() * (svgHeight - 2 * margin),
                    vx: 0,
                    vy: 0
                };
            });
            
            // Simple force simulation
            for (let iteration = 0; iteration < 100; iteration++) {
                const alpha = Math.max(0.01, 1 - iteration / 100);
                
                // Reset forces
                nodes.forEach(node => {
                    positions[node.id].vx = 0;
                    positions[node.id].vy = 0;
                });
                
                // Repulsion between all nodes
                nodes.forEach(nodeA => {
                    nodes.forEach(nodeB => {
                        if (nodeA.id !== nodeB.id) {
                            const dx = positions[nodeA.id].x - positions[nodeB.id].x;
                            const dy = positions[nodeA.id].y - positions[nodeB.id].y;
                            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                            const force = 2000 / (distance * distance);
                            
                            positions[nodeA.id].vx += (dx / distance) * force * alpha;
                            positions[nodeA.id].vy += (dy / distance) * force * alpha;
                        }
                    });
                });
                
                // Attraction along links
                links.forEach(link => {
                    const dx = positions[link.target].x - positions[link.source].x;
                    const dy = positions[link.target].y - positions[link.source].y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = distance * 0.02;
                    
                    positions[link.source].vx += (dx / distance) * force * alpha;
                    positions[link.source].vy += (dy / distance) * force * alpha;
                    positions[link.target].vx -= (dx / distance) * force * alpha;
                    positions[link.target].vy -= (dy / distance) * force * alpha;
                });
                
                // Apply forces and update positions
                nodes.forEach(node => {
                    positions[node.id].x += positions[node.id].vx;
                    positions[node.id].y += positions[node.id].vy;
                    
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
