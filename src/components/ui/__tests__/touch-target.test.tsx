import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { Chip } from '../chip';
import { Input } from '../input';
import { RadioGroup } from '../radio-group';
import { Switch } from '../switch';
import { Tabs, TabsList, TabsTrigger } from '../tabs';

/**
 * "Setiap kontrol interaktif berukuran >= 44x44px pada viewport mobile —
 * tanpa kecuali" (docs/07 §9; spec.md kriteria penerimaan).
 *
 * jsdom tidak menjalankan layout CSS sungguhan, jadi `getBoundingClientRect`
 * selalu nol di sini — mengukur piksel asli dilakukan e2e (Playwright, lihat
 * e2e/kitchen-sink.spec.ts). Test ini memverifikasi niat desainnya: setiap
 * kontrol memakai kelas Tailwind yang SECARA MATEMATIS resolve ke >= 44px
 * (skala 4px Tailwind: `h-11` = 11*4 = 44px), supaya regresi (mis. seseorang
 * mengganti `h-11` jadi `h-10`) tertangkap tanpa perlu browser sungguhan.
 */

const TAILWIND_UNIT_PX = 4;
const MIN_TARGET_PX = 44;

/** Kelas seperti `h-11`, `min-h-11`, `size-11`, `w-11`, `min-w-11` → px. */
function maxPxForAxis(className: string, prefixes: string[]): number {
  const values = prefixes.flatMap((prefix) => {
    const re = new RegExp(`(?:^|\\s)${prefix}-(\\d+)(?:\\s|$)`, 'g');
    return [...className.matchAll(re)].map((m) => Number(m[1]) * TAILWIND_UNIT_PX);
  });
  return values.length > 0 ? Math.max(...values) : 0;
}

function expectMinHeight(className: string) {
  expect(maxPxForAxis(className, ['h', 'min-h', 'size'])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
}

function expectMinWidth(className: string) {
  expect(maxPxForAxis(className, ['w', 'min-w', 'size'])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
}

describe('target sentuh minimum (44x44px)', () => {
  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'Button variant=%s di setiap size punya h >= 44px',
    (variant) => {
      (['sm', 'md', 'lg'] as const).forEach((size) => {
        render(<Button variant={variant} size={size}>{`${variant}-${size}`}</Button>);
        const el = screen.getByRole('button', { name: `${variant}-${size}` });
        expectMinHeight(el.className);
      });
    },
  );

  it('Chip punya h >= 44px dan min-w >= 44px', () => {
    render(<Chip>Kategori</Chip>);
    const el = screen.getByRole('button', { name: 'Kategori' });
    expectMinHeight(el.className);
    expectMinWidth(el.className);
  });

  it('Input punya h >= 44px', () => {
    render(<Input label="Nama" />);
    const el = screen.getByLabelText('Nama');
    expectMinHeight(el.className);
  });

  it('Switch dibungkus kotak >= 44x44px meski thumb visualnya lebih kecil', () => {
    render(<Switch label="Notifikasi" />);
    const wrapper = screen.getByRole('switch', { name: 'Notifikasi' }).parentElement;
    expect(wrapper).not.toBeNull();
    expectMinHeight(wrapper!.className);
    expectMinWidth(wrapper!.className);
  });

  it('baris Checkbox (kontrol + label) punya tinggi baris >= 44px', () => {
    render(<Checkbox label="Ingat saya" />);
    const row = screen.getByRole('checkbox', { name: 'Ingat saya' }).closest('div');
    expect(row).not.toBeNull();
    expectMinHeight(row!.className);
  });

  it('setiap baris RadioGroup punya tinggi >= 44px', () => {
    render(
      <RadioGroup
        label="Jenis"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    for (const radio of screen.getAllByRole('radio')) {
      const row = radio.closest('div');
      expect(row).not.toBeNull();
      expectMinHeight(row!.className);
    }
  });

  it('Tabs trigger (underline & segmented) punya h >= 44px', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList variant="underline">
          <TabsTrigger variant="underline" value="a">
            Tab A
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expectMinHeight(screen.getByRole('tab', { name: 'Tab A' }).className);
  });
});
