import type { SapTable } from "../types/migration";

interface TableCatalogProps {
  tables: SapTable[];
  onChange: (tables: SapTable[]) => void;
}

export function TableCatalog({ tables, onChange }: TableCatalogProps) {
  function updateTable(id: string, patch: Partial<SapTable>) {
    onChange(tables.map((table) => (table.id === id ? { ...table, ...patch } : table)));
  }

  if (tables.length === 0) {
    return (
      <section className="panel empty-panel">
        <strong>No tables scanned yet</strong>
        <p>Start the AI scan to discover SAP APIs and metadata candidates.</p>
      </section>
    );
  }

  return (
    <section className="panel catalog-panel">
      <div className="panel-heading">
        <span>Discovery results</span>
        <strong>{tables.length} candidates</strong>
      </div>

      <div className="catalog-table">
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Table/API</th>
              <th>Module</th>
              <th>Rows</th>
              <th>Confidence</th>
              <th>Destination path</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => (
              <tr key={table.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={table.selected}
                    onChange={(event) => updateTable(table.id, { selected: event.target.checked })}
                  />
                </td>
                <td>
                  <strong>{table.name}</strong>
                  <small>{table.description}</small>
                </td>
                <td>{table.module}</td>
                <td>{table.estimatedRows.toLocaleString()}</td>
                <td>{table.confidence}%</td>
                <td>
                  <input
                    value={table.destinationPath}
                    onChange={(event) =>
                      updateTable(table.id, { destinationPath: event.target.value })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
