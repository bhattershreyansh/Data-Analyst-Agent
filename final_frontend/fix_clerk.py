import os

src_dir = 'src'
for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            path = os.path.join(root, f)
            with open(path, 'r') as file:
                content = file.read()
            
            modified = False
            
            if "import { useAuth } from '@clerk/react';" in content:
                content = content.replace("import { useAuth } from '@clerk/react';", "import { useAuth } from '@/context/AuthContext';")
                modified = True
            elif 'import { useAuth } from "@clerk/react";' in content:
                content = content.replace('import { useAuth } from "@clerk/react";', "import { useAuth } from '@/context/AuthContext';")
                modified = True

            if "import { useAuth, useUser } from '@clerk/react';" in content:
                content = content.replace("import { useAuth, useUser } from '@clerk/react';", "import { useAuth, useUser } from '@/context/AuthContext';")
                modified = True
            elif 'import { useAuth, useUser } from "@clerk/react";' in content:
                content = content.replace('import { useAuth, useUser } from "@clerk/react";', "import { useAuth, useUser } from '@/context/AuthContext';")
                modified = True

            if 'import { Show, UserButton, SignInButton } from "@clerk/react";' in content:
                content = content.replace('import { Show, UserButton, SignInButton } from "@clerk/react";', "")
                modified = True

            if 'import { SignInButton, Show } from "@clerk/react";' in content:
                content = content.replace('import { SignInButton, Show } from "@clerk/react";', "")
                modified = True
            
            if modified:
                with open(path, 'w') as file:
                    file.write(content)
                print(f"Updated {path}")
