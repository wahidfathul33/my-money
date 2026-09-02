'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoryList } from '@/features/categories/components/category-list';
import type { CategoryWithChildren } from '@/features/categories/queries';

interface CategoriesTabsProps {
  expense: CategoryWithChildren[];
  income: CategoryWithChildren[];
}

/** Pengeluaran | Pemasukan — tasks/06-categories/todo.md "tab Pengeluaran | Pemasukan". */
export function CategoriesTabs({ expense, income }: CategoriesTabsProps) {
  return (
    <Tabs defaultValue="expense" className="flex flex-col gap-4">
      <TabsList variant="segmented">
        <TabsTrigger variant="segmented" value="expense">
          Pengeluaran
        </TabsTrigger>
        <TabsTrigger variant="segmented" value="income">
          Pemasukan
        </TabsTrigger>
      </TabsList>
      <TabsContent value="expense">
        <CategoryList type="expense" categories={expense} />
      </TabsContent>
      <TabsContent value="income">
        <CategoryList type="income" categories={income} />
      </TabsContent>
    </Tabs>
  );
}
