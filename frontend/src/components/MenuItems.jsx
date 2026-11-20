import ProductArt from "./ProductArt";

const referenceImages = {
  "passion-ice-tea": "/products/passion-ice-tea.png",
  "peach-ice-tea": "/products/peach-ice-tea.png",
  "hot-cappuccino": "/products/hot-cappuccino.png",
  "hot-coffee": "/products/hot-coffee.png",
  "hot-tea": "/products/hot-tea.png",
  "blue-mojito": "/products/blue-mojito.png",
  "mint-mojito": "/products/mint-mojito.png",
  "chocolate-frappe": "/products/chocolate-frappe.png",
  "cold-coffee": "/products/cold-coffee.png",
};

/**
 * The cards are the live catalogue rows: `canSell` is derived by the API from
 * availability and stock, so a product a manager marks unavailable or runs out
 * of in inventory is un-tappable on the till without a reload.
 */
function MenuItems({ items, addToCart, cart = [] }) {
  const quantityOf = (id) => {
    const line = cart.find((item) => item.id === id);
    return line ? line.quantity : 0;
  };

  return (
    <div className="pos-grid">
      {items.map((item) => {
        const quantity = quantityOf(item.id);
        const soldOut = item.canSell === false;
        const imageKey = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const image = item.imageUrl || referenceImages[imageKey];

        return (
          <button
            key={item.id}
            type="button"
            className={`pos-card${soldOut ? " pos-card--off" : ""}`}
            onClick={() => !soldOut && addToCart(item)}
            disabled={soldOut}
            aria-label={
              soldOut
                ? `${item.name} is unavailable`
                : `Add ${item.name} to order`
            }
          >
            <span className="pos-card-art">
              {image ? (
                <img
                  className="pos-card-img"
                  src={image}
                  alt=""
                  draggable="false"
                  loading="lazy"
                />
              ) : (
                <ProductArt category={item.category} />
              )}
            </span>

            <span className="pos-card-body">
              <span className="pos-card-name">{item.name}</span>

              {item.description ? (
                <span className="pos-card-desc">{item.description}</span>
              ) : null}

              <span className="pos-card-price">
                Rs. {item.price.toFixed(2)}
              </span>

              {item.trackStock && !soldOut ? (
                <span className="pos-card-stock">{item.stock} left</span>
              ) : null}
            </span>

            <span
              className={`pos-card-badge${
                soldOut
                  ? " pos-card-badge--out"
                  : quantity > 0
                    ? " pos-card-badge--on"
                    : ""
              }`}
              aria-hidden="true"
            >
              {soldOut ? "Out" : quantity > 0 ? quantity : "+"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default MenuItems;
