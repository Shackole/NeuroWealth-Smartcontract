import { getDepositAsset } from '@/lib/depositAsset';
import DepositView from './DepositView';

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string | string[] }>;
}) {
  const asset = getDepositAsset((await searchParams).asset);
  return <DepositView key={asset} initialAsset={asset} />;
}
