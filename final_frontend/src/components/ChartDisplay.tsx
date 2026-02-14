import { useState } from 'react';
import { motion } from 'framer-motion';
import Plot from 'react-plotly.js';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Database, FileCode, Heart } from 'lucide-react';
import { QueryResponse, SavedChart } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';

interface ChartDisplayProps {
  result: QueryResponse;
  onSave?: (chart: SavedChart) => void;
  onDelete?: (chartId: string) => void;
}

// Function to convert chart config to Plotly data
function convertChartConfigToPlotlyData(chartConfig: any, data: any[]): any[] {
  console.log('Converting chart config:', chartConfig);
  console.log('Data:', data);

  if (!chartConfig || !data || data.length === 0) {
    console.log('No chart config or data available');
    return [];
  }

  const { type, x, y, title } = chartConfig;

  if (!type) {
    console.log('Missing chart type');
    return [];
  }

  // If x and y are not specified, try to infer from data
  let xField = x;
  let yField = y;

  if (!xField || !yField) {
    const keys = Object.keys(data[0] || {});
    if (keys.length >= 2) {
      xField = xField || keys[0];
      yField = yField || keys[1];
      console.log('Inferred fields:', { xField, yField });
    } else {
      console.log('Not enough fields in data');
      return [];
    }
  }

  // Extract x and y values from data
  const xValues = data.map(row => row[xField]);
  const yValues = data.map(row => row[yField]);

  console.log('X values:', xValues);
  console.log('Y values:', yValues);

  // Check if we have valid data
  if (xValues.length === 0 || yValues.length === 0) {
    console.log('No valid data extracted');
    return [];
  }

  // Filter out null/undefined values
  const validIndices = xValues.map((_, i) => i).filter(i =>
    xValues[i] != null && yValues[i] != null
  );

  const validXValues = validIndices.map(i => xValues[i]);
  const validYValues = validIndices.map(i => yValues[i]);

  if (validXValues.length === 0) {
    console.log('No valid values after filtering');
    return [];
  }

  let plotlyData: any = {};

  switch (type.toLowerCase()) {
    case 'bar':
      plotlyData = {
        x: validXValues,
        y: validYValues,
        type: 'bar',
        marker: {
          color: '#3b82f6',
          line: {
            color: '#2563eb',
            width: 1
          }
        },
        name: title || 'Data',
      };
      break;

    case 'pie':
      plotlyData = {
        labels: validXValues,
        values: validYValues,
        type: 'pie',
        marker: {
          colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'],
        },
        textinfo: 'label+percent',
        textposition: 'auto',
        name: title || 'Data',
      };
      break;

    case 'line':
      plotlyData = {
        x: validXValues,
        y: validYValues,
        type: 'scatter',
        mode: 'lines+markers',
        line: {
          color: '#3b82f6',
          width: 3,
        },
        marker: {
          color: '#3b82f6',
          size: 8,
          line: {
            color: '#2563eb',
            width: 2
          }
        },
        name: title || 'Data',
      };
      break;

    case 'table':
    default:
      // For table type, return empty to show table view only
      console.log('Table type or unknown chart type:', type);
      return [];
  }

  console.log('Generated Plotly data:', plotlyData);
  return [plotlyData];
}

export function ChartDisplay({ result, onSave, onDelete }: ChartDisplayProps) {
  const [isSaved, setIsSaved] = useState(false);
  const [currentChartId, setCurrentChartId] = useState<string | undefined>(result.chart_id);

  // If result.chart_id exists initially, it might be from history/auto-save (if we hadn't disabled it).
  // But now we disabled auto-save. So it might be null.

  const handleToggleSave = () => {
    if (isSaved) {
      // Unsave
      if (currentChartId && onDelete) {
        onDelete(currentChartId);
      }
      setIsSaved(false);
      setCurrentChartId(undefined);
    } else {
      // Save
      if (onSave && result.chart && result.result) {
        const newChartId = uuidv4();
        const chartToSave: SavedChart = {
          chart_id: newChartId,
          question: result.chart?.title || 'Saved Chart',
          chart_type: result.chart.type || 'bar',
          title: result.chart.title || 'Untitled Chart',
          data: result.result,
          query: result.query,
          x_axis: result.chart.x,
          y_axis: result.chart.y,
          timestamp: new Date().toISOString()
        };

        onSave(chartToSave);
        setIsSaved(true);
        setCurrentChartId(newChartId);
      }
    }
  };

  console.log('ChartDisplay received result:', result);

  if (!result.success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-12"
      >
        <div className="text-destructive text-lg font-medium">
          {result.error || 'Query failed'}
        </div>
      </motion.div>
    );
  }

  // Convert chart config to Plotly data
  const chartData = convertChartConfigToPlotlyData(result.chart, result.result || []);

  console.log('Final chart data:', chartData);
  console.log('Chart data length:', chartData.length);

  const layout = {
    title: {
      text: result.chart?.title || 'Chart',
      font: {
        size: 18,
        color: '#1f2937'
      }
    },
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: 'Inter, system-ui, sans-serif',
      color: '#1f2937',
    },
    margin: { l: 60, r: 40, t: 60, b: 60 },
    showlegend: true,
    legend: {
      orientation: 'h',
      y: -0.2
    },
    xaxis: {
      gridcolor: '#e5e7eb',
      showgrid: true,
    },
    yaxis: {
      gridcolor: '#e5e7eb',
      showgrid: true,
    },
    ...result.chart?.layout,
  };

  const showChart = chartData.length > 0 && result.chart?.type?.toLowerCase() !== 'table';
  const showSaveButton = (showChart || (result.result && result.result.length > 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Metadata */}
      <div className="flex flex-wrap gap-3">
        {result.execution_time_ms && (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            {result.execution_time_ms.toFixed(2)}ms
          </Badge>
        )}
        {result.row_count !== undefined && (
          <Badge variant="secondary" className="gap-1">
            <Database className="h-3 w-3" />
            {result.row_count} rows
          </Badge>
        )}
        {result.retrieved_tables && result.retrieved_tables.length > 0 && (
          <Badge variant="secondary" className="gap-1">
            <FileCode className="h-3 w-3" />
            {result.retrieved_tables.join(', ')}
          </Badge>
        )}
      </div>

      {/* SQL Query */}
      {result.query && (
        <Card className="p-4 bg-muted/50">
          <p className="text-xs font-medium text-muted-foreground mb-2">Generated SQL:</p>
          <code className="text-sm font-mono text-foreground break-all">{result.query}</code>
        </Card>
      )}

      {/* Reasoning */}
      {result.reasoning && (
        <Card className="p-4 bg-card border-primary/20">
          <p className="text-xs font-medium text-primary mb-2">AI Reasoning:</p>
          <p className="text-sm text-card-foreground">{result.reasoning}</p>
        </Card>
      )}

      {/* Chart */}
      {showChart ? (
        <Card className="p-6 bg-card">
          <div className="w-full" style={{ minHeight: '450px' }}>
            <Plot
              data={chartData}
              layout={layout}
              config={{
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
              }}
              style={{ width: '100%', height: '450px' }}
              useResizeHandler
            />
          </div>
        </Card>
      ) : result.result && result.result.length > 0 ? (
        <Card className="p-6 bg-card">
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">Displaying data in table format</p>
          </div>
        </Card>
      ) : (
        <Card className="p-6 bg-card">
          <div className="text-center py-8">
            <p className="text-muted-foreground">No data available</p>
          </div>
        </Card>
      )}

      {/* Save Button */}
      {showSaveButton && onSave && (
        <div className="flex justify-start">
          <Button
            variant={isSaved ? "secondary" : "outline"}
            size="sm"
            onClick={handleToggleSave}
            className={`gap-2 ${isSaved ? "text-primary bg-primary/10 border-primary/20" : ""}`}
          >
            <Heart className={`h-4 w-4 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            {isSaved ? "Saved to Dashboard" : "Save Chart"}
          </Button>
        </div>
      )}

      {/* Table View - Always show the data */}
      {result.result && result.result.length > 0 && (
        <Card className="p-6 bg-card overflow-x-auto">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Data Table</h3>
            <p className="text-sm text-muted-foreground">
              {result.result.length} rows returned
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-border">
                  {Object.keys(result.result[0]).map((key) => (
                    <th key={key} className="text-left p-3 font-semibold text-foreground text-sm bg-muted/30">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.result.map((row, idx) => (
                  <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    {Object.values(row).map((value, i) => (
                      <td key={i} className="p-3 text-sm">
                        {value === null || value === undefined ? (
                          <span className="text-muted-foreground italic">null</span>
                        ) : (
                          String(value)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  );
}