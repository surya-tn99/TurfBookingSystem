export default function ManagerFeeAgreement({ accepted, onChange }) {
  return <label className="owner-agreement">
    <input type="checkbox" name="monthlyFeeTermsAccepted" checked={accepted} onChange={(event) => onChange(event.target.checked)} required />
    <span>I agree to a fixed monthly PickTurf platform fee for my turf manager account.</span>
  </label>;
}
