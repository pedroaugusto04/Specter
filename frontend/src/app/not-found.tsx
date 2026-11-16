import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <Card className="max-w-md w-full border-border shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
            <FileQuestion className="w-6 h-6" />
          </div>
          <CardTitle className="text-xl font-semibold">Page Not Found</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground pb-4">
          <p>The page you are looking for does not exist or has been moved.</p>
        </CardContent>
        <CardFooter className="flex justify-center pt-2">
          <Link href="/">
            <Button className="gap-2">
              <Home className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
