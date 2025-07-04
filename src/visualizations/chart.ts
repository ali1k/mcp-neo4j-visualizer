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
}
