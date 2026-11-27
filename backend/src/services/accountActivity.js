import { User } from '../models/User.js';

// Account closure and operations that create deletion blockers write the same user row in a transaction.
export function withActiveAccount(id, role, operation) {
  return User.db.transaction(async (session) => {
    const user = await User.findOneAndUpdate({ _id: id, role, isActive: true },
      { $inc: { accountActivityVersion: 1 } }, { session, returnDocument: 'after' });
    if (!user) throw Object.assign(new Error('This account is no longer active.'), { status: 401 });
    return operation(session, user);
  });
}
