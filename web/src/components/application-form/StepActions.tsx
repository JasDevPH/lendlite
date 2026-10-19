import { Button } from '@/components/ui/Button';

// Footer shared by the form steps: Back (optional) + primary action
export function StepActions({
  onBack,
  submitLabel = 'Save & continue',
  savingLabel = 'Saving…',
  saving,
  note,
}: {
  onBack?: () => void;
  submitLabel?: string;
  savingLabel?: string;
  saving: boolean;
  note?: string;
}) {
  return (
    <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        {onBack && (
          <Button type="button" variant="secondary" onClick={onBack} disabled={saving}>
            ← Back
          </Button>
        )}
        {note && <p className="text-xs text-subtle">{note}</p>}
      </div>
      <Button type="submit" size="lg" loading={saving}>
        {saving ? savingLabel : submitLabel}
      </Button>
    </div>
  );
}
