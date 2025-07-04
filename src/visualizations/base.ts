import { Neo4jNode, Neo4jRelationship, VisualizationOptions } from '../types.js';

export abstract class BaseVisualization {
  protected createEmptyVisualization(title: string, width: number, height: number, message: string): string {
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

  protected getUniqueNodeTypes(nodes: Neo4jNode[]): string[] {
    const types = new Set<string>();
    nodes.forEach(node => {
      node.labels.forEach(label => types.add(label));
    });
    return Array.from(types);
  }

  protected getUniqueEdgeTypes(relationships: Neo4jRelationship[]): string[] {
    const types = new Set<string>();
    relationships.forEach(rel => types.add(rel.type));
    return Array.from(types);
  }

  abstract generate(data: any, options: VisualizationOptions): Promise<{ content: Array<{ type: string; text: string }> }>;
}
