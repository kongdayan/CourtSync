export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">即将推出</p>
      </div>
    </div>
  );
}
