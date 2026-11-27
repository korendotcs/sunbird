// @description Hides incoming typing indicators from other users to reduce distraction
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const typing = phoenix.gateway.typingStart;
if (typing) {
  phoenix.hook(typing, { before: () => false });
}
