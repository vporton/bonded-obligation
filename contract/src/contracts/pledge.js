import { E } from '@agoric/eventual-send';

class _Pledge {
    constructor(zcf, timerService, pledge, ransomAmount, lockedUntil) {
        let _offer = null;
        const _pledge = pledge;
        const _ransomAmount = ransomAmount;
        let _lockedUntil = lockedUntil;
        this.lockedUntil = function() {
            return _lockedUntil;
        }
        this.getPledge = async function() {
            if(!_offer) return;
            //const zoe = zcf.getZoeService();
            return /*zoe.isOfferActive(_offer) &&*/ await E(timerService).getCurrentTimestamp() >= _lockedUntil ? _pledge : null;
        }
        this.ransomAmount = function() {
            return _ransomAmount;
        }
        // SECURITY: Don't forget to call this function,
        // otherwise getPayment() will always return null.
        this.setOffer = function(offer) {
            _offer = offer;
        }
    }
}

_Pledge = harden(_Pledge);

export function makePledge(zcf, timerService, payment, lockedUntil) {
    return harden(new _Pledge(zcf, timerService, payment, lockedUntil));
}