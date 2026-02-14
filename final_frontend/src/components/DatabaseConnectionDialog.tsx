import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface DatabaseConnectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function DatabaseConnectionDialog({
    open,
    onOpenChange,
    onSuccess,
}: DatabaseConnectionDialogProps) {
    const [formData, setFormData] = useState({
        name: "",
        db_type: "postgresql",
        host: "localhost",
        port: "5432",
        username: "",
        password: "",
        database: "",
    });
    const [connecting, setConnecting] = useState(false);
    const { toast } = useToast();

    const handleDbTypeChange = (value: string) => {
        // Update default port based on database type
        const defaultPorts: Record<string, string> = {
            postgresql: "5432",
            mysql: "3306",
            sqlserver: "1433",
        };

        setFormData({
            ...formData,
            db_type: value,
            port: defaultPorts[value] || formData.port,
        });
    };

    const handleConnect = async () => {
        // Validation
        if (!formData.name || !formData.host || !formData.username || !formData.database) {
            toast({
                title: "Missing fields",
                description: "Please fill in all required fields",
                variant: "destructive",
            });
            return;
        }

        setConnecting(true);

        try {
            const response = await fetch("http://localhost:8000/data-sources/database", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ...formData,
                    port: parseInt(formData.port),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                toast({
                    title: "Database connected",
                    description: `${data.name} with ${data.table_count} tables connected successfully`,
                });

                // Reset form
                setFormData({
                    name: "",
                    db_type: "postgresql",
                    host: "localhost",
                    port: "5432",
                    username: "",
                    password: "",
                    database: "",
                });
                onOpenChange(false);

                if (onSuccess) {
                    onSuccess();
                }
            } else {
                const error = await response.json();
                throw new Error(error.detail || "Connection failed");
            }
        } catch (error) {
            toast({
                title: "Connection failed",
                description: error instanceof Error ? error.message : "Failed to connect to database",
                variant: "destructive",
            });
        } finally {
            setConnecting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Connect to Database</DialogTitle>
                    <DialogDescription>
                        Connect to your PostgreSQL, MySQL, or SQL Server database
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Connection Name */}
                    <div className="space-y-2">
                        <Label htmlFor="name">Connection Name *</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Production Database"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    {/* Database Type */}
                    <div className="space-y-2">
                        <Label htmlFor="db_type">Database Type *</Label>
                        <Select value={formData.db_type} onValueChange={handleDbTypeChange}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="postgresql">PostgreSQL</SelectItem>
                                <SelectItem value="mysql">MySQL</SelectItem>
                                <SelectItem value="sqlserver">SQL Server</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Host and Port */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 space-y-2">
                            <Label htmlFor="host">Host *</Label>
                            <Input
                                id="host"
                                placeholder="localhost"
                                value={formData.host}
                                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="port">Port *</Label>
                            <Input
                                id="port"
                                type="number"
                                value={formData.port}
                                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Username and Password */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username *</Label>
                            <Input
                                id="username"
                                placeholder="postgres"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Database Name */}
                    <div className="space-y-2">
                        <Label htmlFor="database">Database Name *</Label>
                        <Input
                            id="database"
                            placeholder="mydb"
                            value={formData.database}
                            onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                        />
                    </div>

                    <p className="text-xs text-muted-foreground">
                        * Required fields
                    </p>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={connecting}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleConnect} disabled={connecting}>
                        {connecting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <Database className="mr-2 h-4 w-4" />
                                Connect
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
