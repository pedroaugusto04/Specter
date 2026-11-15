'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client error for tracking / monitoring
    console.error('Unhandled frontend application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <Card className="max-w-md w-full border-destructive/30 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3 text-destructive">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <CardTitle className="text-xl font-semibold">Algo deu errado</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground pb-4">
          <p>
            Ocorreu um erro inesperado na interface. Você pode tentar recarregar a seção ou voltar ao
            início.
          </p>
          {process.env.NODE_ENV !== 'production' && error.message && (
            <p className="mt-3 p-2 bg-muted rounded text-xs font-mono text-left break-words">
              {error.message}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-3 pt-2">
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Ir para Início
          </Button>
          <Button onClick={() => reset()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
