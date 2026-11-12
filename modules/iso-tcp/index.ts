import { requireNativeModule } from 'expo';
import type { NativeIsoTcp } from '../../src/nativeTransport';

export default requireNativeModule<NativeIsoTcp>('IsoTcp');
