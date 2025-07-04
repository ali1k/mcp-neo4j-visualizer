export function getNodeIcon(labels: string[]): string {
  const iconMap: Record<string, string> = {
    'Database': 'database',
    'Table': 'table',
    'Column': 'columns',
    'View': 'eye',
    'Schema': 'sitemap',
    'User': 'user',
    'Role': 'users',
    'Process': 'cogs',
    'File': 'file',
    'System': 'server'
  };

  for (const label of labels) {
    if (iconMap[label]) {
      return iconMap[label];
    }
  }
  return 'circle';
}

export function getNodeColor(primaryLabel: string): string {
  const colorMap: Record<string, string> = {
    'Database': '#2185D0',
    'Table': '#21BA45',
    'Column': '#F2711C',
    'View': '#6435C9',
    'Schema': '#A333C8',
    'User': '#E03997',
    'Role': '#A5673F',
    'Process': '#767676',
    'File': '#FBBD08',
    'System': '#DB2828',
    'Group': '#e9ecef'
  };

  return colorMap[primaryLabel] || '#00B5AD';
}

export function getEdgeColor(relationType: string): string {
  const colorMap: Record<string, string> = {
    'CONTAINS': '#21BA45',
    'REFERENCES': '#2185D0',
    'DEPENDS_ON': '#F2711C',
    'FLOWS_TO': '#6435C9',
    'TRANSFORMS': '#A333C8',
    'ACCESSES': '#E03997'
  };

  return colorMap[relationType] || '#999999';
}
