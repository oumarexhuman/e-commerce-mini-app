export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface ProductPage {
  items: Product[];
  nextCursor: string | null;
  pageSize: number;
}
