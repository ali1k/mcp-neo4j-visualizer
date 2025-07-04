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
      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; }
        html, body {
            margin: 0; padding: 0; width: 100%; height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background-color: #f8f9fa; overflow: hidden;
        }
        #root { width: 100%; height: 100%; }
        .iframe-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; padding: 12px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .iframe-header h1 { margin: 0; font-size: 18px; font-weight: 600; }
        .iframe-header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; }
        .content { padding: 20px; text-align: center; }
    </style>
</head>
<body>
    <div id="root">
        <div class="iframe-header">
            <h1>${title}</h1>
            <p>No data available to display</p>
        </div>
        <div class="content">
            <p style="color: #666; font-size: 16px;">📊 No records found to display in table format</p>
        </div>
    </div>
</body>
</html>`;
    }

    // Get all unique keys from records
    const allKeys = new Set<string>();
    records.forEach(record => {
      Object.keys(record).forEach(key => allKeys.add(key));
    });
    const headers = Array.from(allKeys);

    const tableRows = records.map((record, index) => {
      const cells = headers.map(header => {
        const value = record[header];
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }
        return value || '';
      });
      return `<tr data-row="${index}">${cells.map(cell => `<td>${this.escapeHtml(String(cell))}</td>`).join('')}</tr>`;
    }).join('');

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
        .table-container {
            flex: 1;
            padding: 20px;
            overflow: auto;
            background: white;
            margin: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .stats {
            margin-bottom: 20px;
            padding: 15px;
            background: #e9ecef;
            border-radius: 8px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            font-size: 14px;
        }
        .search-container {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .search-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        .search-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }
        .table-wrapper {
            overflow: auto;
            max-height: 400px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 200px;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
            position: sticky;
            top: 0;
            z-index: 10;
            border-bottom: 2px solid #dee2e6;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        tr.highlighted {
            background-color: #fff3cd !important;
        }
        .pagination {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
        }
        .pagination-controls {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .pagination-btn {
            padding: 6px 12px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .pagination-btn:hover:not(:disabled) {
            background: #f8f9fa;
        }
        .pagination-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .page-size-select {
            padding: 6px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        .export-btn {
            padding: 8px 16px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .export-btn:hover {
            background: #218838;
        }
        .no-results {
            text-align: center;
            padding: 40px;
            color: #666;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="iframe-header">
            <h1>${title}</h1>
            <p>📊 Interactive data table • ${records.length} records • ${headers.length} columns</p>
        </div>
        <div class="table-container">
            <div class="stats">
                <div><strong>Total Records:</strong> ${records.length}</div>
                <div><strong>Columns:</strong> ${headers.length}</div>
                <div><strong>Data Types:</strong> ${this.getDataTypes(records, headers).join(', ')}</div>
            </div>
            
            <div class="search-container">
                <input type="text" class="search-input" placeholder="🔍 Search in table data..." id="searchInput">
                <button class="export-btn" onclick="exportToCSV()">📥 Export CSV</button>
            </div>
            
            <div class="table-wrapper">
                <table id="dataTable">
                    <thead>
                        <tr>${headers.map(header => `<th title="${this.escapeHtml(header)}">${this.escapeHtml(header)}</th>`).join('')}</tr>
                    </thead>
                    <tbody id="tableBody">
                        ${tableRows}
                    </tbody>
                </table>
            </div>
            
            <div class="pagination">
                <div class="pagination-info">
                    Showing <span id="showingStart">1</span> to <span id="showingEnd">${Math.min(50, records.length)}</span> of <span id="totalRecords">${records.length}</span> records
                </div>
                <div class="pagination-controls">
                    <label>Show: 
                        <select class="page-size-select" id="pageSizeSelect">
                            <option value="25">25</option>
                            <option value="50" selected>50</option>
                            <option value="100">100</option>
                            <option value="all">All</option>
                        </select>
                    </label>
                    <button class="pagination-btn" id="prevBtn" onclick="changePage(-1)">← Previous</button>
                    <span id="pageInfo">Page 1 of <span id="totalPages">1</span></span>
                    <button class="pagination-btn" id="nextBtn" onclick="changePage(1)">Next →</button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const allRecords = ${JSON.stringify(records)};
        const headers = ${JSON.stringify(headers)};
        let filteredRecords = [...allRecords];
        let currentPage = 1;
        let pageSize = 50;
        
        function renderTable() {
            const tbody = document.getElementById('tableBody');
            const startIndex = pageSize === 'all' ? 0 : (currentPage - 1) * pageSize;
            const endIndex = pageSize === 'all' ? filteredRecords.length : startIndex + pageSize;
            const pageRecords = filteredRecords.slice(startIndex, endIndex);
            
            if (pageRecords.length === 0) {
                tbody.innerHTML = '<tr><td colspan="' + headers.length + '" class="no-results">No records match your search criteria</td></tr>';
            } else {
                tbody.innerHTML = pageRecords.map((record, index) => {
                    const cells = headers.map(header => {
                        const value = record[header];
                        const displayValue = typeof value === 'object' && value !== null ? 
                            JSON.stringify(value) : (value || '');
                        return \`<td title="\${escapeHtml(String(displayValue))}">\${escapeHtml(String(displayValue))}</td>\`;
                    });
                    return \`<tr data-row="\${startIndex + index}">\${cells.join('')}</tr>\`;
                }).join('');
            }
            
            updatePaginationInfo();
        }
        
        function updatePaginationInfo() {
            const totalPages = pageSize === 'all' ? 1 : Math.ceil(filteredRecords.length / pageSize);
            const startIndex = pageSize === 'all' ? 1 : (currentPage - 1) * pageSize + 1;
            const endIndex = pageSize === 'all' ? filteredRecords.length : Math.min(currentPage * pageSize, filteredRecords.length);
            
            document.getElementById('showingStart').textContent = filteredRecords.length === 0 ? 0 : startIndex;
            document.getElementById('showingEnd').textContent = endIndex;
            document.getElementById('totalRecords').textContent = filteredRecords.length;
            document.getElementById('pageInfo').innerHTML = \`Page \${currentPage} of <span id="totalPages">\${totalPages}</span>\`;
            
            document.getElementById('prevBtn').disabled = currentPage === 1 || pageSize === 'all';
            document.getElementById('nextBtn').disabled = currentPage === totalPages || pageSize === 'all';
        }
        
        function changePage(direction) {
            if (pageSize === 'all') return;
            
            const totalPages = Math.ceil(filteredRecords.length / pageSize);
            currentPage = Math.max(1, Math.min(totalPages, currentPage + direction));
            renderTable();
        }
        
        function filterRecords(searchTerm) {
            if (!searchTerm.trim()) {
                filteredRecords = [...allRecords];
            } else {
                const term = searchTerm.toLowerCase();
                filteredRecords = allRecords.filter(record => {
                    return headers.some(header => {
                        const value = record[header];
                        const searchValue = typeof value === 'object' && value !== null ? 
                            JSON.stringify(value) : String(value || '');
                        return searchValue.toLowerCase().includes(term);
                    });
                });
            }
            currentPage = 1;
            renderTable();
        }
        
        function exportToCSV() {
            const csvContent = [
                headers.join(','),
                ...filteredRecords.map(record => 
                    headers.map(header => {
                        const value = record[header];
                        const csvValue = typeof value === 'object' && value !== null ? 
                            JSON.stringify(value) : String(value || '');
                        return '"' + csvValue.replace(/"/g, '""') + '"';
                    }).join(',')
                )
            ].join('\\n');
            
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '${title.replace(/[^a-zA-Z0-9]/g, '_')}_data.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Event listeners
        document.getElementById('searchInput').addEventListener('input', (e) => {
            filterRecords(e.target.value);
        });
        
        document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
            pageSize = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
            currentPage = 1;
            renderTable();
        });
        
        // Initialize table
        renderTable();
    </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    // Pure JS HTML escaping for Node.js
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getDataTypes(records: any[], headers: string[]): string[] {
    const types = new Set<string>();
    
    headers.forEach(header => {
      const values = records.map(r => r[header]).filter(v => v != null);
      if (values.length > 0) {
        const sampleValue = values[0];
        if (typeof sampleValue === 'number') types.add('Number');
        else if (typeof sampleValue === 'boolean') types.add('Boolean');
        else if (typeof sampleValue === 'object') types.add('Object');
        else types.add('Text');
      }
    });
    
    return Array.from(types);
  }
}
