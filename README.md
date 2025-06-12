# Neo4j Visualizer MCP Server

This MCP server provides visualization tools for Neo4j query results, allowing you to create interactive graphs, tables, charts, and timelines from your Neo4j data.

## Features

- **Interactive Graph Networks**: Create D3.js-powered network visualizations of nodes and relationships
- **Data Tables**: Generate formatted HTML tables from query records
- **Charts**: Create intelligent, interactive chart visualizations with automatic type detection
- **Timelines**: Create timeline visualizations (extensible)


## How to Use

```
{
  mcpServers: {
    "neo4j-visualizer": {
      "command": "npx",
      "args": ["mcp-neo4j-visualizer"]
    }
  }
}
```

## Available Tools

### 1. `visualize_neo4j_results`
Main visualization tool that can create different types of visualizations based on your data.

**Parameters:**
- `data` (required): Neo4j query results containing nodes, relationships, or records
- `type` (required): Type of visualization ('graph', 'table', 'chart', 'timeline')
- `title` (optional): Title for the visualization (default: 'Neo4j Query Results')
- `width` (optional): Width in pixels (default: 800)
- `height` (optional): Height in pixels (default: 600)
- `outputPath` (optional): File path to save the HTML visualization

### 2. `create_graph_network`
Specialized tool for creating interactive network graphs.

**Parameters:**
- `nodes` (required): Array of Neo4j nodes
- `relationships` (required): Array of Neo4j relationships
- `title` (optional): Title for the graph
- `width` (optional): Width in pixels
- `height` (optional): Height in pixels
- `outputPath` (optional): File path to save the HTML

### 3. `create_data_table`
Specialized tool for creating formatted data tables.

**Parameters:**
- `records` (required): Array of query result records
- `title` (optional): Title for the table
- `outputPath` (optional): File path to save the HTML

### 4. `get_visualization_component`
Generate React component code for embedding visualizations in your UI.

**Parameters:**
- `data` (required): Neo4j query results
- `type` (required): Visualization type ('graph', 'table', 'chart', 'timeline')
- `componentName` (optional): Name for the React component (default: 'Neo4jVisualization')
- `width` (optional): Width in pixels (default: 800)
- `height` (optional): Height in pixels (default: 600)

### 5. `get_d3_visualization_data`
Get processed data and D3.js code for direct integration into existing React components.

**Parameters:**
- `data` (required): Neo4j query results
- `type` (required): Visualization type ('graph', 'table', 'chart', 'timeline')

## Chart Visualization Features

The chart visualization system (`type: 'chart'`) provides intelligent, interactive charts with automatic type detection:

### Supported Chart Types

1. **Bar Chart** (Default)
   - Used for categorical data
   - Interactive hover tooltips
   - Color-coded bars
   - Rotated labels for better readability

2. **Pie Chart**
   - Automatically selected for categorical data with ≤10 categories and positive values
   - Interactive slices with hover effects
   - Built-in legend
   - Percentage labels on slices

3. **Line Chart**
   - Used for sequential/time-series data
   - Smooth curve interpolation
   - Interactive data points
   - Ideal for trend visualization

4. **Scatter Plot**
   - Used when data contains x,y coordinates
   - Color-coded points
   - Interactive tooltips showing coordinates
   - Perfect for correlation analysis

5. **Histogram**
   - Automatically selected for continuous numeric data with wide ranges (>20 data points)
   - Configurable bins
   - Shows data distribution
   - Interactive bin tooltips

### Smart Data Processing

The chart system automatically processes different Neo4j data structures:

#### From Records with Numeric Data
```javascript
{
  "records": [
    {"name": "Product A", "sales": 150, "profit": 30},
    {"name": "Product B", "sales": 200, "profit": 45},
    {"name": "Product C", "sales": 120, "profit": 25}
  ]
}
// Creates bar chart using first numeric field (sales)
```

#### From Node Data (Frequency Analysis)
```javascript
{
  "nodes": [
    {"id": "1", "labels": ["Person"], "properties": {"name": "Alice"}},
    {"id": "2", "labels": ["Person"], "properties": {"name": "Bob"}},
    {"id": "3", "labels": ["Company"], "properties": {"name": "ACME"}}
  ]
}
// Creates pie chart showing: Person: 2, Company: 1
```

#### From Relationship Data (Type Analysis)
```javascript
{
  "relationships": [
    {"type": "WORKS_FOR", "startNodeId": "1", "endNodeId": "3"},
    {"type": "KNOWS", "startNodeId": "1", "endNodeId": "2"},
    {"type": "WORKS_FOR", "startNodeId": "2", "endNodeId": "3"}
  ]
}
// Creates bar chart showing: WORKS_FOR: 2, KNOWS: 1
```

### Chart Features

- **Interactive Tooltips**: Hover over any chart element to see detailed information
- **Modern Styling**: Professional design with smooth animations and transitions
- **Responsive Design**: Charts adapt to different screen sizes
- **Color Schemes**: Uses D3's Category10 color palette for consistency
- **Automatic Scaling**: Smart axis scaling and formatting
- **Error Handling**: Graceful handling of empty or invalid data with informative messages

## Usage Examples

### Example 1: Visualizing a Graph Network

```javascript
// First, get data from Neo4j using the neo4j-query MCP server
// Then visualize it with the neo4j-visualizer

// Sample data structure:
const sampleData = {
  nodes: [
    {
      id: "1",
      labels: ["Person"],
      properties: { name: "Alice", age: 30 }
    },
    {
      id: "2", 
      labels: ["Person"],
      properties: { name: "Bob", age: 25 }
    }
  ],
  relationships: [
    {
      id: "r1",
      type: "KNOWS",
      startNodeId: "1",
      endNodeId: "2",
      properties: { since: "2020" }
    }
  ]
};

// Use the visualize_neo4j_results tool:
{
  "data": sampleData,
  "type": "graph",
  "title": "Social Network",
  "width": 1000,
  "height": 700,
  "outputPath": "/path/to/social_network.html"
}
```

### Example 2: Creating a Data Table

```javascript
// Sample records data:
const records = [
  { name: "Alice", age: 30, city: "New York" },
  { name: "Bob", age: 25, city: "San Francisco" },
  { name: "Charlie", age: 35, city: "Chicago" }
];

// Use the create_data_table tool:
{
  "records": records,
  "title": "User Data",
  "outputPath": "/path/to/user_table.html"
}
```

### Example 3: Creating Interactive Charts

```javascript
// Example 1: Sales data (creates bar chart)
const salesData = {
  "records": [
    {"product": "Laptop", "sales": 150, "profit": 30},
    {"product": "Phone", "sales": 200, "profit": 45},
    {"product": "Tablet", "sales": 120, "profit": 25},
    {"product": "Watch", "sales": 180, "profit": 40}
  ]
};

// Use the visualize_neo4j_results tool:
{
  "data": salesData,
  "type": "chart",
  "title": "Product Sales Analysis",
  "width": 900,
  "height": 600,
  "outputPath": "/path/to/sales_chart.html"
}

// Example 2: Node distribution (creates pie chart)
const nodeData = {
  "nodes": [
    {"id": "1", "labels": ["Person"], "properties": {"name": "Alice"}},
    {"id": "2", "labels": ["Person"], "properties": {"name": "Bob"}},
    {"id": "3", "labels": ["Company"], "properties": {"name": "ACME"}},
    {"id": "4", "labels": ["Company"], "properties": {"name": "TechCorp"}},
    {"id": "5", "labels": ["Person"], "properties": {"name": "Charlie"}}
  ]
};

// This automatically creates a pie chart showing node type distribution
{
  "data": nodeData,
  "type": "chart",
  "title": "Database Node Distribution",
  "outputPath": "/path/to/node_distribution.html"
}
```

## Extending the Visualizer

The server is designed to be extensible. You can:

1. **Add new visualization types** by extending the `type` enum and adding new methods
2. **Customize chart implementations** in `createChartVisualization()` and `createTimelineVisualization()`
3. **Add new styling options** by modifying the HTML templates
4. **Integrate with other visualization libraries** by updating the dependencies and templates

## File Structure

```
neo4j-visualizer/
├── src/
│   └── index.ts          # Main server implementation
├── build/
│   └── index.js          # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Development

To modify the server:

1. Edit `src/index.ts`
2. Run `npm run build` to compile
3. The MCP settings will automatically use the updated version

## Troubleshooting

- **Server not connecting**: Check that the build path in MCP settings matches the actual build output
- **Visualization not rendering**: Ensure your data structure matches the expected format
- **Missing dependencies**: Run `npm install` in the server directory

## Next Steps

You can now use commands like:
- "Create a graph visualization of the Neo4j query results"
- "Generate a table from the database records"
- "Visualize the relationship network and save it to a file"

The visualizer will work seamlessly with your existing Neo4j infrastructure!
