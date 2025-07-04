import { BaseVisualization } from './base.js';
import { Neo4jQueryResult, VisualizationOptions } from '../types.js';

export class ChartVisualization extends BaseVisualization {
  async generate(args: { data: Neo4jQueryResult; title?: string; width?: number; height?: number }): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { data, title = 'Neo4j Chart', width = 800, height = 600 } = args;
    
    // Process the data to determine the best chart type and extract chart data
    const chartData = this.processChartData(data);
    
    if (!chartData || chartData.length === 0) {
      const html = this.createEmptyVisualization(title, width, height, "No data available for chart visualization");
      return {
        content: [
          {
            type: 'text',
            text: `Created empty chart visualization\n\nVisualization HTML:\n${html}`,
          },
        ],
      };
    }

    // Determine chart type based on data structure
    const chartType = this.determineChartType(chartData);
    const html = this.createChartVisualization(data, title, width, height, chartData, chartType);
    
    return {
      content: [
        {
          type: 'text',
          text: `Created ${chartType} chart visualization from query results\n\nVisualization HTML:\n${html}`,
        },
      ],
    };
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

  private extractChartDataFromNodes(nodes: any[]): any[] {
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

  private extractChartDataFromRelationships(relationships: any[]): any[] {
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

  private createChartVisualization(data: any, title: string, width: number, height: number, chartData: any[], chartType: string): string {
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
            display: flex;
            flex-direction: column;
        }
        .iframe-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
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
        .chart-container {
            flex: 1;
            padding: 20px;
            overflow: auto;
            background: white;
            margin: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .chart-info {
            background: #e9ecef;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .chart-canvas {
            width: 100%;
            height: 400px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            background: #fafafa;
            position: relative;
            overflow: hidden;
        }
        .tooltip {
            position: absolute;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .legend {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e9ecef;
        }
        .legend-items {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }
        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 3px;
        }
        .chart-stats {
            margin-top: 20px;
            padding: 15px;
            background: #e3f2fd;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="iframe-header">
            <h1>${title}</h1>
            <p>📊 ${chartType.charAt(0).toUpperCase() + chartType.slice(1)} chart • ${chartData.length} data points</p>
        </div>
        <div class="chart-container">
            <div class="chart-info">
                <div><strong>Chart Type:</strong> ${chartType.charAt(0).toUpperCase() + chartType.slice(1)}</div>
                <div><strong>Data Points:</strong> ${chartData.length}</div>
                <div><strong>Value Range:</strong> ${Math.min(...chartData.map(d => d.value))} - ${Math.max(...chartData.map(d => d.value))}</div>
            </div>
            
            <div class="chart-canvas" id="chartCanvas">
                <!-- Chart will be rendered here -->
            </div>
            
            <div class="legend">
                <h4 style="margin-top: 0; color: #333;">🏷️ Legend</h4>
                <div class="legend-items" id="legendItems">
                    <!-- Legend items will be generated here -->
                </div>
            </div>
            
            <div class="chart-stats">
                <h4 style="margin-top: 0; color: #1976d2;">📈 Statistics</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div><strong>Total Value:</strong> ${chartData.reduce((sum, d) => sum + d.value, 0)}</div>
                    <div><strong>Average:</strong> ${(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length).toFixed(2)}</div>
                    <div><strong>Max Value:</strong> ${Math.max(...chartData.map(d => d.value))}</div>
                    <div><strong>Min Value:</strong> ${Math.min(...chartData.map(d => d.value))}</div>
                </div>
            </div>
        </div>
        
        <div class="tooltip" id="tooltip"></div>
    </div>
    
    <script>
        const rawData = ${JSON.stringify(data)};
        const chartData = ${JSON.stringify(chartData)};
        const chartType = "${chartType}";
        
        // Color palette
        const colors = ['#00B5AD', '#FF6B35', '#F7931E', '#FFD23F', '#EE5A24', '#5F27CD', '#00D2D3', '#FF9FF3', '#54A0FF', '#5F27CD'];
        
        function createChart() {
            const canvas = document.getElementById('chartCanvas');
            const tooltip = document.getElementById('tooltip');
            
            // Clear canvas
            canvas.innerHTML = '';
            
            switch(chartType) {
                case 'bar':
                    createBarChart(canvas, tooltip);
                    break;
                case 'pie':
                    createPieChart(canvas, tooltip);
                    break;
                case 'line':
                    createLineChart(canvas, tooltip);
                    break;
                default:
                    createBarChart(canvas, tooltip);
            }
            
            createLegend();
        }
        
        function createBarChart(canvas, tooltip) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.width = '100%';
            svg.style.height = '100%';
            
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const margin = { top: 20, right: 20, bottom: 60, left: 60 };
            const chartWidth = width - margin.left - margin.right;
            const chartHeight = height - margin.top - margin.bottom;
            
            // Calculate scales
            const maxValue = Math.max(...chartData.map(d => d.value));
            const barWidth = chartWidth / chartData.length * 0.8;
            const barSpacing = chartWidth / chartData.length * 0.2;
            
            chartData.forEach((d, i) => {
                const x = margin.left + i * (barWidth + barSpacing) + barSpacing / 2;
                const barHeight = (d.value / maxValue) * chartHeight;
                const y = margin.top + chartHeight - barHeight;
                
                // Create bar
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x);
                rect.setAttribute('y', y);
                rect.setAttribute('width', barWidth);
                rect.setAttribute('height', barHeight);
                rect.setAttribute('fill', colors[i % colors.length]);
                rect.style.cursor = 'pointer';
                rect.style.transition = 'opacity 0.3s ease';
                
                // Add hover effects
                rect.addEventListener('mouseenter', (e) => {
                    rect.style.opacity = '0.8';
                    showTooltip(e, d, tooltip);
                });
                rect.addEventListener('mouseleave', () => {
                    rect.style.opacity = '1';
                    hideTooltip(tooltip);
                });
                
                svg.appendChild(rect);
                
                // Add label
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', x + barWidth / 2);
                text.setAttribute('y', margin.top + chartHeight + 20);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-size', '12');
                text.setAttribute('fill', '#666');
                text.textContent = d.label.length > 10 ? d.label.substring(0, 10) + '...' : d.label;
                svg.appendChild(text);
                
                // Add value label on bar
                const valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                valueText.setAttribute('x', x + barWidth / 2);
                valueText.setAttribute('y', y - 5);
                valueText.setAttribute('text-anchor', 'middle');
                valueText.setAttribute('font-size', '11');
                valueText.setAttribute('font-weight', 'bold');
                valueText.setAttribute('fill', '#333');
                valueText.textContent = d.value;
                svg.appendChild(valueText);
            });
            
            canvas.appendChild(svg);
        }
        
        function createPieChart(canvas, tooltip) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.width = '100%';
            svg.style.height = '100%';
            
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 2 - 40;
            
            const total = chartData.reduce((sum, d) => sum + d.value, 0);
            let currentAngle = 0;
            
            chartData.forEach((d, i) => {
                const sliceAngle = (d.value / total) * 2 * Math.PI;
                const startAngle = currentAngle;
                const endAngle = currentAngle + sliceAngle;
                
                // Create pie slice path
                const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
                const x1 = centerX + radius * Math.cos(startAngle);
                const y1 = centerY + radius * Math.sin(startAngle);
                const x2 = centerX + radius * Math.cos(endAngle);
                const y2 = centerY + radius * Math.sin(endAngle);
                
                const pathData = [
                    \`M \${centerX} \${centerY}\`,
                    \`L \${x1} \${y1}\`,
                    \`A \${radius} \${radius} 0 \${largeArcFlag} 1 \${x2} \${y2}\`,
                    'Z'
                ].join(' ');
                
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathData);
                path.setAttribute('fill', colors[i % colors.length]);
                path.setAttribute('stroke', 'white');
                path.setAttribute('stroke-width', '2');
                path.style.cursor = 'pointer';
                path.style.transition = 'opacity 0.3s ease';
                
                // Add hover effects
                path.addEventListener('mouseenter', (e) => {
                    path.style.opacity = '0.8';
                    showTooltip(e, d, tooltip);
                });
                path.addEventListener('mouseleave', () => {
                    path.style.opacity = '1';
                    hideTooltip(tooltip);
                });
                
                svg.appendChild(path);
                
                // Add percentage label
                const labelAngle = startAngle + sliceAngle / 2;
                const labelRadius = radius * 0.7;
                const labelX = centerX + labelRadius * Math.cos(labelAngle);
                const labelY = centerY + labelRadius * Math.sin(labelAngle);
                const percentage = ((d.value / total) * 100).toFixed(1);
                
                if (percentage > 5) { // Only show label if slice is large enough
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', labelX);
                    text.setAttribute('y', labelY);
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('font-size', '12');
                    text.setAttribute('font-weight', 'bold');
                    text.setAttribute('fill', 'white');
                    text.textContent = percentage + '%';
                    svg.appendChild(text);
                }
                
                currentAngle += sliceAngle;
            });
            
            canvas.appendChild(svg);
        }
        
        function createLineChart(canvas, tooltip) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.width = '100%';
            svg.style.height = '100%';
            
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const margin = { top: 20, right: 20, bottom: 60, left: 60 };
            const chartWidth = width - margin.left - margin.right;
            const chartHeight = height - margin.top - margin.bottom;
            
            const maxValue = Math.max(...chartData.map(d => d.value));
            const minValue = Math.min(...chartData.map(d => d.value));
            const valueRange = maxValue - minValue || 1;
            
            // Create line path
            let pathData = '';
            chartData.forEach((d, i) => {
                const x = margin.left + (i / (chartData.length - 1)) * chartWidth;
                const y = margin.top + chartHeight - ((d.value - minValue) / valueRange) * chartHeight;
                
                if (i === 0) {
                    pathData += \`M \${x} \${y}\`;
                } else {
                    pathData += \` L \${x} \${y}\`;
                }
                
                // Add data point
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', x);
                circle.setAttribute('cy', y);
                circle.setAttribute('r', 4);
                circle.setAttribute('fill', colors[0]);
                circle.setAttribute('stroke', 'white');
                circle.setAttribute('stroke-width', 2);
                circle.style.cursor = 'pointer';
                
                circle.addEventListener('mouseenter', (e) => {
                    circle.setAttribute('r', 6);
                    showTooltip(e, d, tooltip);
                });
                circle.addEventListener('mouseleave', () => {
                    circle.setAttribute('r', 4);
                    hideTooltip(tooltip);
                });
                
                svg.appendChild(circle);
            });
            
            // Add line
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathData);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', colors[0]);
            path.setAttribute('stroke-width', 3);
            svg.appendChild(path);
            
            canvas.appendChild(svg);
        }
        
        function createLegend() {
            const legendContainer = document.getElementById('legendItems');
            legendContainer.innerHTML = '';
            
            chartData.forEach((d, i) => {
                const item = document.createElement('div');
                item.className = 'legend-item';
                
                const colorBox = document.createElement('div');
                colorBox.className = 'legend-color';
                colorBox.style.backgroundColor = colors[i % colors.length];
                
                const label = document.createElement('span');
                label.textContent = d.label;
                label.style.fontSize = '14px';
                
                item.appendChild(colorBox);
                item.appendChild(label);
                legendContainer.appendChild(item);
            });
        }
        
        function showTooltip(event, data, tooltip) {
            tooltip.style.opacity = '1';
            tooltip.innerHTML = \`<strong>\${data.label}</strong><br/>Value: \${data.value}\`;
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY - 10) + 'px';
        }
        
        function hideTooltip(tooltip) {
            tooltip.style.opacity = '0';
        }
        
        // Initialize chart
        createChart();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            setTimeout(createChart, 100);
        });
    </script>
</body>
</html>`;
  }
}
