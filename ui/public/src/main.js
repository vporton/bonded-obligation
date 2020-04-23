// @ts-check
import dappConstants from '../lib/constants.js';
import { connect } from './connect.js';
import { walletUpdatePurses, flipSelectedBrands } from './wallet.js';

const { INSTANCE_REG_KEY } = dappConstants;

/**
 * @type {Object.<string, HTMLSelectElement>}
 */
const selects = {
  $brands: /** @type {HTMLSelectElement} */ (document.getElementById('brands')),
  $tipPurse: /** @type {HTMLSelectElement} */ (document.getElementById('tipPurse')),
};

const $forTip = document.getElementById('forTip');

export default async function main() {
  /**
   * @param {{ type: string; data: any; }} obj
   */
  const walletRecv = obj => {
    switch (obj.type) {
      case 'walletUpdatePurses': {
        const purses = JSON.parse(obj.data);
        console.log('got purses', purses);
        walletUpdatePurses(purses, selects);
        break;
      }
      case 'walletURL': {
       // FIXME: Change the anchor href to URL.
       break;
      }
    }
  };

  /**
   * @param {{ type: string; data: any; }} obj
   */
  const apiRecv = obj => {
    switch (obj.type) {
      case 'encouragement/getEncouragementResponse':
        alert(`Encourager says: ${obj.data}`);
        break;
      case 'encouragement/encouragedResponse':
        break;
    }
  };

  const $encourageMe = /** @type {HTMLInputElement} */ (document.getElementById('encourageMe'));
  
  const walletSend = await connect('wallet', walletRecv).then(walletSend => {
    walletSend({ type: 'walletGetPurses'});
    return walletSend;
  });

  const apiSend = await connect('api', apiRecv).then(apiSend => {
    $encourageMe.removeAttribute('disabled');
    $encourageMe.addEventListener('click', () => {
      const now = Date.now();
      const offer = {
        // JSONable ID for this offer.  This is scoped to the origin.
        id: now,
    
        // Contract-specific metadata.
        instanceRegKey: INSTANCE_REG_KEY,
    
        // Format is:
        //   hooks[targetName][hookName] = [hookMethod, ...hookArgs].
        // Then is called within the wallet as:
        //   E(target)[hookMethod](...hookArgs)
        hooks: {
          publicAPI: {
            getInvite: ['makeInvite'], // E(publicAPI).makeInvite()
          },
        },
    
        proposalTemplate: {
          give: {
            Tip: {
              // The pursePetname identifies which purse we want to use
              pursePetname: 'Fun budget',
              extent: 1,
            },
          },
          exit: { onDemand: null },
        },
      };
      walletSend({
        type: 'walletAddOffer',
        data: offer
      });
    });
    
    return apiSend;
  });
}

main();
