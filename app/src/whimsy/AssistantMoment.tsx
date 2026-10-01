import { useEgg } from './eggs';
import type { MomentId } from './moments';
import { useMoment } from './useMoment';
import { AssistantPose, type PoseSize } from './AssistantPose';

/** Drop-in: Assistant for a named moment, or nothing when the level says so. */
export function AssistantMoment({ id, size = 'spot' }: { id: MomentId; size?: PoseSize }) {
  const moment = useMoment(id);
  const egg = useEgg('pet-assistant');
  if (!moment) return null;
  return <AssistantPose moment={moment} size={size} pose={egg.pose} onPress={egg.onTap} />;
}
