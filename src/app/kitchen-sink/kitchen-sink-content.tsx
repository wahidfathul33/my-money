'use client';

import { Inbox, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { MoneyText } from '@/components/finance/money-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Progress, ProgressRing } from '@/components/ui/progress';
import { RadioGroup } from '@/components/ui/radio-group';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { fromRupiah } from '@/lib/finance/money';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-separator flex flex-col gap-4 border-b py-8">
      <h2 className="text-title text-text font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function ToastDemo() {
  const { show } = useToast();
  return (
    <Row>
      <Button
        variant="secondary"
        onClick={() =>
          show({ title: 'Tersimpan', description: 'Transaksi dicatat.', variant: 'info' })
        }
      >
        Toast info
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          show({ title: 'Berhasil', description: 'Dompet dibuat.', variant: 'success' })
        }
      >
        Toast success
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          show({
            title: 'Transaksi dihapus',
            variant: 'error',
            action: {
              label: 'Urungkan',
              onClick: () => show({ title: 'Dipulihkan', variant: 'success' }),
            },
          })
        }
      >
        Toast error + undo
      </Button>
    </Row>
  );
}

export function KitchenSinkContent() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <ToastProvider>
      <main className="px-page-x mx-auto flex max-w-3xl flex-col pb-24">
        <header className="py-8">
          <h1 className="text-hero text-text font-bold">Kitchen Sink</h1>
          <p className="text-body text-text-muted">
            Setiap primitif dari docs/07-design-system.md, dalam setiap varian dan state. Halaman
            khusus pengembangan.
          </p>
        </header>

        <Section title="MoneyText">
          <div className="flex flex-col gap-3">
            <Row>
              <MoneyText amount={fromRupiah(45_000)} showSign />
              <MoneyText amount={-fromRupiah(45_000)} showSign />
              <MoneyText amount={0n} />
              <MoneyText amount={fromRupiah(500_000)} tone="neutral" />
            </Row>
            <Row>
              <MoneyText amount={fromRupiah(1_200_000_000)} size="hero" showSign />
            </Row>
            <Row>
              <MoneyText amount={fromRupiah(8_500_000)} size="display" />
              <MoneyText amount={fromRupiah(150_000)} size="lg" />
              <MoneyText amount={fromRupiah(150_000)} size="md" />
              <MoneyText amount={fromRupiah(150_000)} size="sm" />
            </Row>
            <Row>
              <MoneyText amount={-fromRupiah(999_999_999_999)} showSign />
            </Row>
          </div>
        </Section>

        <Section title="Button">
          <div className="flex flex-col gap-3">
            {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
              <Row key={variant}>
                <Button variant={variant} size="sm">
                  {variant} sm
                </Button>
                <Button variant={variant} size="md">
                  {variant} md
                </Button>
                <Button variant={variant} size="lg">
                  {variant} lg
                </Button>
              </Row>
            ))}
            <Row>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </Row>
          </div>
        </Section>

        <Section title="Input">
          <div className="flex max-w-sm flex-col gap-4">
            <Input label="Nama dompet" placeholder="Dompet Utama" />
            <Input type="number" label="Jumlah" placeholder="0" />
            <Input type="money" label="Nominal" placeholder="Rp0" />
            <Input label="Email" error="Format email tidak valid" defaultValue="bukan-email" />
          </div>
        </Section>

        <Section title="Select">
          <div className="max-w-sm">
            <Select
              label="Dompet"
              placeholder="Pilih dompet"
              options={[
                { value: 'cash', label: 'Tunai' },
                { value: 'bca', label: 'BCA' },
                { value: 'gopay', label: 'GoPay' },
              ]}
            />
          </div>
        </Section>

        <Section title="Sheet & Dialog">
          <Row>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="secondary">Buka sheet (bottom)</Button>
              </SheetTrigger>
              <SheetContent
                variant="bottom"
                title="Pilih dompet"
                description="Sheet naik dari bawah, tanpa JS animasi."
              >
                <div className="flex flex-col gap-2">
                  <Chip>Tunai</Chip>
                  <Chip>BCA</Chip>
                </div>
              </SheetContent>
            </Sheet>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">Buka dialog (center)</Button>
              </DialogTrigger>
              <DialogContent
                variant="center"
                title="Konfirmasi"
                description="Padanan desktop dari Sheet."
              >
                <Button onClick={() => setDialogOpen(false)}>Tutup</Button>
              </DialogContent>
            </Dialog>
          </Row>
        </Section>

        <Section title="Card">
          <Row>
            <Card variant="flat" className="w-48">
              <p className="text-text-muted text-sm">Flat</p>
              <Button size="sm" variant="ghost" className="rounded-inner mt-2">
                Aksi
              </Button>
            </Card>
            <Card variant="raised" className="w-48">
              <p className="text-text-muted text-sm">Raised</p>
              <Button size="sm" variant="ghost" className="rounded-inner mt-2">
                Aksi
              </Button>
            </Card>
          </Row>
        </Section>

        <Section title="Tabs">
          <div className="flex flex-col gap-6">
            <Tabs defaultValue="a">
              <TabsList variant="underline">
                <TabsTrigger variant="underline" value="a">
                  Pengeluaran
                </TabsTrigger>
                <TabsTrigger variant="underline" value="b">
                  Pemasukan
                </TabsTrigger>
              </TabsList>
              <TabsContent value="a" className="text-text-muted pt-4 text-sm">
                Konten pengeluaran
              </TabsContent>
              <TabsContent value="b" className="text-text-muted pt-4 text-sm">
                Konten pemasukan
              </TabsContent>
            </Tabs>
            <Tabs defaultValue="a">
              <TabsList variant="segmented">
                <TabsTrigger variant="segmented" value="a">
                  Harian
                </TabsTrigger>
                <TabsTrigger variant="segmented" value="b">
                  Bulanan
                </TabsTrigger>
              </TabsList>
              <TabsContent value="a" className="text-text-muted pt-4 text-sm">
                Konten harian
              </TabsContent>
              <TabsContent value="b" className="text-text-muted pt-4 text-sm">
                Konten bulanan
              </TabsContent>
            </Tabs>
          </div>
        </Section>

        <Section title="Chip">
          <Row>
            <Chip variant="selectable">Makanan</Chip>
            <Chip variant="selectable" selected>
              Transportasi
            </Chip>
            <Chip variant="filter">Bulan ini</Chip>
            <Chip variant="filter" selected>
              7 hari terakhir
            </Chip>
          </Row>
        </Section>

        <Section title="Progress">
          <div className="flex items-center gap-8">
            <div className="max-w-sm flex-1">
              <Progress value={65} label="Anggaran makanan" />
            </div>
            <ProgressRing value={40} label="Target liburan" />
          </div>
        </Section>

        <Section title="Skeleton">
          <div className="flex flex-col gap-6">
            <Skeleton variant="text" className="max-w-xs" />
            <Skeleton variant="card" className="max-w-sm" />
            <Skeleton variant="list" rows={3} className="max-w-sm" />
          </div>
        </Section>

        <Section title="Toast">
          <ToastDemo />
        </Section>

        <Section title="EmptyState">
          <EmptyState
            icon={Inbox}
            title="Belum ada transaksi"
            description="Catat transaksi pertama Anda untuk mulai melacak keuangan."
            action={<Button size="sm">Tambah transaksi</Button>}
          />
        </Section>

        <Section title="Avatar">
          <Row>
            <Avatar name="Budi Santoso" />
            <Avatar name="Siti Aminah" size={48} />
          </Row>
        </Section>

        <Section title="Switch">
          <Row>
            <Switch label="Notifikasi aktif" defaultChecked />
            <Switch label="Mode gelap" />
            <Switch label="Disabled" disabled />
          </Row>
        </Section>

        <Section title="Checkbox">
          <Row>
            <Checkbox label="Ingat saya" defaultChecked />
            <Checkbox label="Kirim salinan" />
            <Checkbox label="Disabled" disabled />
          </Row>
        </Section>

        <Section title="RadioGroup">
          <RadioGroup
            label="Jenis transaksi"
            defaultValue="expense"
            options={[
              { value: 'expense', label: 'Pengeluaran' },
              { value: 'income', label: 'Pemasukan' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />
        </Section>

        <Section title="Tooltip (Popover API)">
          <Tooltip content="Saldo setelah dikurangi anggaran bulan ini">
            <span className="border-border text-text-muted flex size-11 items-center justify-center rounded-full border">
              <Wallet className="size-5" aria-hidden="true" />
            </span>
          </Tooltip>
        </Section>
      </main>
    </ToastProvider>
  );
}
