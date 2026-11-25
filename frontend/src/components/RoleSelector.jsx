export default function RoleSelector({ selectedRole, onSelectRole }) {
  return (
    <fieldset className="roles">
      <legend>Account type</legend>
      <div className="role-options">
        <label className="role-option">
          <input type="radio" name="role" value="customer" checked={selectedRole === 'customer'} onChange={() => onSelectRole('customer')} />
          <span><strong>Player</strong><small>I play or organize games</small></span>
        </label>
        <label className="role-option">
          <input type="radio" name="role" value="owner" checked={selectedRole === 'owner'} onChange={() => onSelectRole('owner')} />
          <span><strong>Turf owner</strong><small>I run a sports venue</small></span>
        </label>
      </div>
    </fieldset>
  );
}
