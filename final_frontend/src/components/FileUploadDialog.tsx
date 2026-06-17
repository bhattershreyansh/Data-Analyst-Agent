import { useState, useCallback } from "react";
import { useAuth } from '@/context/AuthContext';
import { dataSourcesAPI } from "@/lib/api";
import { Upload, X, FileSpreadsheet, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

interface FileUploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (sourceId: string) => void;
}

export function FileUploadDialog({
    open,
    onOpenChange,
    onSuccess,
}: FileUploadDialogProps) {
    const { getToken } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState("");
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const { toast } = useToast();

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            handleFileSelect(droppedFile);
        }
    }, []);

    const handleFileSelect = (selectedFile: File) => {
        const validTypes = [
            "text/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ];

        if (!validTypes.includes(selectedFile.type) &&
            !selectedFile.name.endsWith('.csv') &&
            !selectedFile.name.endsWith('.xlsx') &&
            !selectedFile.name.endsWith('.xls')) {
            toast({
                title: "Invalid file type",
                description: "Please upload a CSV or Excel file (.csv, .xlsx, .xls)",
                variant: "destructive",
            });
            return;
        }

        setFile(selectedFile);
        if (!name) {
            // Auto-fill name from filename
            const fileName = selectedFile.name.replace(/\.[^/.]+$/, "");
            setName(fileName);
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            toast({
                title: "No file selected",
                description: "Please select a file to upload",
                variant: "destructive",
            });
            return;
        }

        setUploading(true);

        try {
            const uploadFormData = new FormData();
            uploadFormData.append("file", file);
            if (name) {
                uploadFormData.append("name", name);
            }

            const token = await getToken();
            const response = await dataSourcesAPI.uploadFile(uploadFormData, token);

            if (response.success) {
                const data = response.data;
                const sheetInfo = data.table_count > 1 
                    ? ` across ${data.table_count} sheets` 
                    : '';
                toast({
                    title: "File uploaded successfully",
                    description: `${data.name} — ${data.row_count} rows${sheetInfo} loaded`,
                });

                // Reset form
                setFile(null);
                setName("");
                onOpenChange(false);

                if (onSuccess) {
                    onSuccess(data.source_id);
                }
            } else {
                throw new Error(response.error || "Upload failed");
            }
        } catch (error) {
            toast({
                title: "Upload failed",
                description: error instanceof Error ? error.message : "Failed to upload file",
                variant: "destructive",
            });
        } finally {
            setUploading(false);
        }
    };

    const removeFile = () => {
        setFile(null);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Upload Data File</DialogTitle>
                    <DialogDescription>
                        Upload a CSV or Excel file to analyze with natural language queries
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* File Name Input */}
                    <div className="space-y-2">
                        <Label htmlFor="name">Data Source Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Sales Data Q4 2024"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {/* Drag and Drop Area */}
                    <div
                        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                                ? "border-primary bg-primary/5"
                                : "border-muted-foreground/25 hover:border-muted-foreground/50"
                            }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        {file ? (
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <FileSpreadsheet className="h-8 w-8 text-primary" />
                                    <div className="text-left">
                                        <p className="font-medium">{file.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {(file.size / 1024).toFixed(2)} KB
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={removeFile}
                                    disabled={uploading}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">
                                        Drag and drop your file here
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        or click to browse
                                    </p>
                                </div>
                                <Input
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileInputChange}
                                    className="hidden"
                                    id="file-upload"
                                />
                                <Label htmlFor="file-upload">
                                    <Button variant="outline" size="sm" asChild>
                                        <span>Browse Files</span>
                                    </Button>
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Supported formats: CSV, Excel (.xlsx, .xls)
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={uploading}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={!file || uploading}>
                        {uploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
