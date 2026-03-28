import * as Clerk from '@clerk/react';
console.log(Object.keys(Clerk).filter(k => k.includes('Sign') || k.includes('User')));
