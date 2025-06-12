# Neo4j Visualizer MCP Server

This MCP server provides visualization tools for Neo4j query results, allowing you to create interactive graphs, tables, charts, and timelines from your Neo4j data.

## Features

- **Interactive Graph Networks**: Create D3.js-powered network visualizations of nodes and relationships
- **Data Tables**: Generate formatted HTML tables from query records
- **Charts**: Create basic chart visualizations (extensible)
- **Timelines**: Create timeline visualizations (extensible)

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

## Integration with Your Neo4j System

Since you already have a Neo4j MCP server integrated in your system (`chatWithGraphMCP.ts`), you can now combine both servers:

1. **Query Neo4j**: Use your existing neo4j-query MCP server to execute Cypher queries
2. **Visualize Results**: Use the neo4j-visualizer MCP server to create visualizations from the query results

### Example Workflow:

1. Execute a Cypher query using your Neo4j MCP server:
   ```cypher
   MATCH (p:Person)-[r:KNOWS]->(f:Person)
   RETURN p, r, f
   ```

2. Take the results and pass them to the visualizer:
   ```javascript
   // The query results would be in the format expected by the visualizer
   {
     "data": {
       "nodes": [...], // nodes from your query
       "relationships": [...] // relationships from your query
     },
     "type": "graph",
     "title": "Person Relationships",
     "outputPath": "/path/to/visualization.html"
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
