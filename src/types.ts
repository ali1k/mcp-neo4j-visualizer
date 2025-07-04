export interface Neo4jNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

export interface Neo4jRelationship {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties: Record<string, any>;
}

export interface Neo4jQueryResult {
  nodes?: Neo4jNode[];
  relationships?: Neo4jRelationship[];
  records?: any[];
}

export interface VisualizationOptions {
  title?: string;
  width?: number;
  height?: number;
  outputPath?: string;
}

export interface LineageConfig {
  direction?: 'LR' | 'TB' | 'RL' | 'BT';
  groupByProperty?: string;
  showHierarchy?: boolean;
  enableFiltering?: boolean;
  enableExpansion?: boolean;
  nodeSpacing?: number;
  rankSpacing?: number;
}
