import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardAPI } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Grid, Rows, Columns, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface CreateDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCharts: string[];
}

export function CreateDashboardDialog({
  open,
  onOpenChange,
  selectedCharts,
}: CreateDashboardDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [layout, setLayout] = useState<'grid' | 'rows' | 'columns'>('grid');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: () =>
      dashboardAPI.createDashboard({
        dashboard_name: name.trim(),
        description: description.trim() || undefined,
        layout_type: layout,
        include_all: selectedCharts.length === 0,
        selected_chart_ids: selectedCharts.length > 0 ? selectedCharts : undefined,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      toast.success('Dashboard created successfully!');
      onOpenChange(false);
      // Reset form
      setName('');
      setDescription('');
      setLayout('grid');
      // Navigate to the new dashboard
      navigate(`/dashboard/${response.data.dashboard_id}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create dashboard');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) {
      toast.error('Dashboard name must be at least 3 characters');
      return;
    }
    mutation.mutate();
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      onOpenChange(false);
      // Reset form when closing
      setTimeout(() => {
        setName('');
        setDescription('');
        setLayout('grid');
      }, 200);
    }
  };

  const layoutOptions = [
    {
      value: 'grid',
      label: 'Grid Layout',
      icon: Grid,
      description: 'Responsive grid with equal-sized charts',
    },
    {
      value: 'rows',
      label: 'Row Layout',
      icon: Rows,
      description: 'Stack charts vertically',
    },
    {
      value: 'columns',
      label: 'Column Layout',
      icon: Columns,
      description: 'Arrange charts side by side',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Dashboard</DialogTitle>
            <DialogDescription>
              {selectedCharts.length > 0 ? (
                <>
                  Create a new dashboard with {selectedCharts.length} selected chart
                  {selectedCharts.length !== 1 ? 's' : ''}
                </>
              ) : (
                'Create a new dashboard with all saved charts'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedCharts.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  No charts selected. The dashboard will include all saved charts.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">
                Dashboard Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Monthly Performance Review"
                required
                disabled={mutation.isPending}
                minLength={3}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                {name.length}/100 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this dashboard..."
                rows={3}
                disabled={mutation.isPending}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/500 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="layout">Layout Style</Label>
              <Select
                value={layout}
                onValueChange={(value) => setLayout(value as 'grid' | 'rows' | 'columns')}
                disabled={mutation.isPending}
              >
                <SelectTrigger id="layout">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {layoutOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <div>
                            <div className="font-medium">{option.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {option.description}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={name.trim().length < 3 || mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Dashboard
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}