import { Suspense } from 'react';
import { ApplicationWizard } from '@/components/application-form/ApplicationWizard';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

export const metadata = { title: 'Apply for a loan' };

// The wizard reads ?draft=&step= with useSearchParams, which needs a Suspense
// boundary. (Fine here: this page is behind the auth guard, so it renders in
// the browser anyway.)
export default function NewApplicationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApplicationWizard />
    </Suspense>
  );
}
