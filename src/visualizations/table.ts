import fs from 'fs';
import { BaseVisualization } from './base.js';
import { VisualizationOptions } from '../types.js';

export class TableVisualization extends BaseVisualization {
  async generate(args: { records: any[]; title?: string; outputPath?: string }): Promise<{ content: Array<{ type: string; text: string }> }> {
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
}
